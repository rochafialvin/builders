/**
 * refresh-repos — keeps public.repo_signals current, so no page view ever
 * waits on GitHub.
 *
 * Called two ways, both from the database (see
 * 20261022000100_refresh_repo_signals.sql):
 *
 *   - by pg_cron every six hours, with an empty body: refresh every listed
 *     repository whose row is older than STALE_AFTER, or missing;
 *   - by a trigger when a repository is listed, re-linked or opened to PRs,
 *     with `{ "repos": ["owner/name"] }`: refresh just those, now.
 *
 * It answers 202 at once and works in the background: pg_net gives up on a
 * slow response after a few seconds, and nothing waits for the result anyway.
 *
 * Deployed with `--no-verify-jwt`; the caller proves itself with the shared
 * REFRESH_SECRET instead, which lives in this function's secrets and in the
 * database's Vault. Without it anybody holding the public anon key could make
 * this function spend the GitHub token's rate limit.
 *
 * Secrets: GITHUB_TOKEN (any read-only token; GraphQL requires one),
 * REFRESH_SECRET. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by
 * the platform and never leave it.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.51.0";
import { BATCH_SIZE, buildQuery, chunk, isRepoKey, parseResponse, repoKeyFromUrl, type RepoKey, type RepoSignal } from "./signals.ts";

/** How old a row may be before the scheduled run asks again. */
const STALE_AFTER_HOURS = 6;
/** Matches PR_EVIDENCE_DAYS in app/lib/directory.ts. */
const PR_EVIDENCE_DAYS = 90;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

Deno.serve(async (request) => {
  const secret = Deno.env.get("REFRESH_SECRET");
  if (!secret || request.headers.get("x-refresh-secret") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const asked = Array.isArray(body?.repos)
    ? body.repos.filter((repo: unknown): repo is RepoKey => typeof repo === "string" && isRepoKey(repo))
    : null;

  EdgeRuntime.waitUntil(
    refresh(asked).catch((error) => console.error(`[refresh-repos] ${error instanceof Error ? error.message : error}`)),
  );
  return new Response("Accepted", { status: 202 });
});

async function refresh(asked: RepoKey[] | null): Promise<void> {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) throw new Error("GITHUB_TOKEN is not set.");

  // Only repositories the directory lists, even when a caller names others.
  const listed = await listedRepos(supabase);
  let repos = asked ? asked.filter((repo) => listed.has(repo)) : [...listed];

  if (!asked) {
    const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 3_600_000).toISOString();
    const { data, error } = await supabase.from("repo_signals").select("repo").gte("checked_at", cutoff);
    if (error) throw new Error(error.message);
    const fresh = new Set((data ?? []).map((row) => row.repo));
    repos = repos.filter((repo) => !fresh.has(repo));
  }
  if (repos.length === 0) return;

  const since = new Date(Date.now() - PR_EVIDENCE_DAYS * 86_400_000).toISOString().slice(0, 10);

  for (const batch of chunk(repos, BATCH_SIZE)) {
    for (const signal of await askGitHub(batch, since, token)) {
      // Row by row, writing only what GitHub actually answered: a repository it
      // could not find keeps its last good numbers, and a failed search keeps
      // the last good PR count. Only the error and the check time always move.
      const { error } = await supabase.from("repo_signals").upsert(knownColumns(signal), { onConflict: "repo" });
      if (error) throw new Error(error.message);
    }
  }
}

/**
 * One batch's signals. A query GitHub gives up on — a 502 at its ten-second
 * limit, or our own timeout — is asked again in two halves, down to a single
 * repository, so one heavy repository cannot hold the rest back. A repository
 * that fails alone keeps its last good numbers: yesterday's beat none.
 */
async function askGitHub(batch: RepoKey[], since: string, token: string): Promise<RepoSignal[]> {
  let failure: string;
  try {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "builders-refresh-repos" },
      body: JSON.stringify({ query: buildQuery(batch, since) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return parseResponse(batch, await response.json(), new Date().toISOString());
    failure = `GitHub answered ${response.status}`;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (batch.length === 1) {
    console.error(`[refresh-repos] ${failure} for ${batch[0]}; its last numbers stay.`);
    return [];
  }
  const half = Math.ceil(batch.length / 2);
  return [...(await askGitHub(batch.slice(0, half), since, token)), ...(await askGitHub(batch.slice(half), since, token))];
}

function knownColumns(signal: RepoSignal): Partial<RepoSignal> {
  const row: Partial<RepoSignal> = { repo: signal.repo, checked_at: signal.checked_at, last_error: signal.last_error };
  if (signal.stars === null) return row;
  Object.assign(row, {
    stars: signal.stars,
    language: signal.language,
    description: signal.description,
    pushed_at: signal.pushed_at,
    archived: signal.archived,
  });
  if (signal.outside_prs !== null) row.outside_prs = signal.outside_prs;
  return row;
}

/** Every repository the directory shows: the approved catalogue, and products' GitHub links. */
async function listedRepos(supabase: SupabaseClient): Promise<Set<RepoKey>> {
  const [catalogue, products] = await Promise.all([
    supabase.from("oss_repos").select("repo").eq("status", "approved"),
    supabase.from("projects").select("repo_url").ilike("repo_url", "%github.com/%"),
  ]);
  if (catalogue.error) throw new Error(catalogue.error.message);
  if (products.error) throw new Error(products.error.message);

  const repos = new Set<RepoKey>();
  for (const row of catalogue.data ?? []) {
    const repo = String(row.repo ?? "");
    if (isRepoKey(repo)) repos.add(repo);
  }
  for (const row of products.data ?? []) {
    const key = repoKeyFromUrl(String(row.repo_url ?? ""));
    if (key) repos.add(key);
  }
  return repos;
}
