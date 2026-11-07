import { type NextRequest, type NextResponse } from "next/server";
import { getSupabase } from "../../lib/supabase";
import { siteOrigin } from "../../lib/origin";
import { sameOriginRedirect } from "../../lib/redirect";
import { gitHubLinkFailedPath, pinnedOrigin, safeNextPath, startPath } from "../../lib/urls";

/**
 * Exchanges a provider's short-lived OAuth code — Google's or GitHub's — for
 * the session cookies used by the app. `via` names the provider; it is set by
 * `startOAuth` and only decides which failure to report. The GitHub account a
 * sign-in links is recorded on the profile by the database itself — see
 * 20261103000000_linked_github.sql.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const via = request.nextUrl.searchParams.get("via") === "github" ? "github" : "google";
  const supabase = await getSupabase();

  const failure = new URLSearchParams();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Stay on this host. The session cookies were just written here, and a
    // redirect to any other name for the site would arrive without them.
    if (!error) {
      if (via === "github") await keepNewestGitHub(supabase);
      return sameOriginRedirect(startPath(next));
    }

    // A code is single use, and a successful exchange clears the verifier it
    // was spent against. So the second visit to this URL — a refresh, a retry,
    // a browser replaying the navigation — fails in a way that looks exactly
    // like a sign-in that never worked. Ask who is here before believing that:
    // if a session exists, the exchange already happened and there is nothing
    // wrong to report.
    const { data } = await supabase.auth.getUser();
    if (data.user) return sameOriginRedirect(startPath(next));

    // Past that, the exchange genuinely failed. Say what Supabase said — the
    // message is the only way to tell these apart from the outside, and
    // guessing from the shape of it is how the wrong sentence gets shown.
    console.error(`[builders] OAuth code exchange failed: ${error.message}`, {
      code: error.code,
      status: error.status,
      origin: await siteOrigin(),
      invoked: request.nextUrl.origin,
    });

    // Only when the verifier is missing *and* nobody is signed in has the
    // journey plausibly changed origin along the way — the cookie is written
    // where the sign-in started and read here.
    const missingVerifier = /code[ _]verifier/i.test(error.message);
    failure.set("error", missingVerifier ? "origin-mismatch" : `${via}-failed`);
  } else {
    // No code: the provider or Supabase refused. Somebody already signed in
    // was linking GitHub, and /signin would bounce them straight back without
    // a word — so say it where they started. A GitHub account that is
    // already linked, to another member or to this one, is worth naming.
    const errorCode = request.nextUrl.searchParams.get("error_code");
    const description = request.nextUrl.searchParams.get("error_description") ?? "";
    if (via === "github" && supabase && (await supabase.auth.getUser()).data.user) {
      console.error(`[builders] GitHub link refused: ${errorCode ?? "unknown"}`, description);
      const reason = errorCode !== "identity_already_exists" ? "failed" : /another user/i.test(description) ? "taken" : "same";
      return sameOriginRedirect(gitHubLinkFailedPath(next, reason));
    }
    failure.set("error", `${via}-failed`);
  }

  if (next !== "/") failure.set("next", next);
  return retry(`/signin?${failure}`, failure.get("error") === "origin-mismatch");
}

/**
 * Sends a failed sign-in somewhere it can actually be retried.
 *
 * `origin-mismatch` means this callback is not on the host the sign-in left from,
 * so trying again from here would fail the same way. When the deployment names
 * one address for sign-in, hand them that address; otherwise stay put, because
 * a guessed host is worse than the one they are on.
 */
function retry(path: string, wrongHost: boolean): NextResponse | Response {
  const pinned = wrongHost ? pinnedOrigin(process.env) : null;
  return pinned ? Response.redirect(new URL(path, pinned), 307) : sameOriginRedirect(path);
}

/**
 * After a GitHub account is switched (see `startOAuth`), the member has two
 * GitHub identities: the one just linked and the one it replaces. The newest
 * stays; the rest are unlinked. The database already shows the new one on the
 * profile, and keeps it when the old one goes (20261104000000_switch_github.sql),
 * so a failure here only leaves the old account able to sign in too — logged,
 * not shown.
 */
async function keepNewestGitHub(supabase: NonNullable<Awaited<ReturnType<typeof getSupabase>>>): Promise<void> {
  const { data } = await supabase.auth.getUserIdentities();
  const github = (data?.identities ?? [])
    .filter((identity) => identity.provider === "github")
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const old of github.slice(1)) {
    const { error } = await supabase.auth.unlinkIdentity(old);
    if (error) console.error(`[builders] The replaced GitHub account could not be unlinked: ${error.code ?? "unknown"}`, error.message);
  }
}
