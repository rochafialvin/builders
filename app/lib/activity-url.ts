import {
  isBoardCount,
  isBoardSpan,
  isActivityScope,
  type ActivityPlace,
  type ActivityQuery,
  type ActivityScope,
  type BoardCount,
  type BoardOf,
  type BoardSpan,
  type GitHubActivityFilter,
} from "./github-activity";

/**
 * The activity page's address — the home page, `/` — both ways: what a URL asks for, and the URL for a
 * set of filters. Shared by the page on the server (the header's return
 * address) and the feed in the browser, which filters without a round trip —
 * the same arrangement as directory-url.ts.
 */

export type ActivityFilters = ActivityQuery & { scope: ActivityScope; weeks: BoardSpan; count: BoardCount };

type Query = Record<string, string | string[] | undefined> | URLSearchParams;

const HANDLE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const REPO_KEY = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9._-]{1,100}$/;

function read(query: Query, key: string): string {
  const value = query instanceof URLSearchParams ? query.get(key) : query[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export function readActivityFilters(query: Query): ActivityFilters {
  // The board's card holds the choices — whose repos, which PRs — and the
  // feed follows it. Older links, from when the feed had its own "show"
  // select (show=, view=), land on the nearest.
  const askedScope = read(query, "scope");
  const askedKind = read(query, "show");
  const view = read(query, "view");
  const askedCount = read(query, "count");
  let scope: ActivityScope = isActivityScope(askedScope) && askedScope !== "all" ? askedScope : "external";
  if (askedKind === "commits" || view === "own") scope = "own";
  const count: BoardCount = isBoardCount(askedCount) ? askedCount : askedKind === "merged" || view === "merged" ? "merged" : "opened";
  // The feed shows what the board counts: merged PRs only, or every kind.
  const kind: GitHubActivityFilter = scope === "external" && count === "merged" ? "merged" : "all";
  const member = read(query, "member").trim();
  const repo = read(query, "repo").trim().toLowerCase();
  const weeks = read(query, "weeks");
  return {
    // Contributions unless asked otherwise: what the page is for.
    scope,
    // The leaderboard's weeks: the season unless asked.
    weeks: isBoardSpan(weeks) ? weeks : "season",
    // Which PRs fill the board's weeks: every one opened unless asked.
    count,
    kind,
    member: HANDLE.test(member) ? member : "",
    repo: REPO_KEY.test(repo) ? repo : "",
    q: read(query, "q").slice(0, 100),
  };
}

/** The page asked for; the feed clamps it to the pages there are. */
export function readActivityPage(query: Query): number {
  const page = Number(read(query, "page"));
  return Number.isInteger(page) && page > 1 ? page : 1;
}

/** The address for a set of filters; changing any of them goes back to page one. */
export function activityPath(filters: Partial<ActivityFilters>, page = 1): string {
  const params = new URLSearchParams();
  if (filters.scope && filters.scope !== "external") params.set("scope", filters.scope);
  if (filters.weeks && filters.weeks !== "season") params.set("weeks", filters.weeks);
  if (filters.count && filters.count !== "opened") params.set("count", filters.count);
  if (filters.member) params.set("member", filters.member);
  if (filters.repo) params.set("repo", filters.repo);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/${search ? `?${search}` : ""}`;
}

/** What /leaderboard is asked for; each left out of its address at its default. */
export type LeaderboardChoice = { of: BoardOf; count: BoardCount; weeks: BoardSpan; place: ActivityPlace };

export function leaderboardPath({ of, count, weeks, place }: LeaderboardChoice): string {
  const params = new URLSearchParams();
  if (of !== "external") params.set("of", of);
  // Own repos are counted by every PR opened: no merged-only choice.
  if (count !== "opened" && of === "external") params.set("count", count);
  if (weeks !== "season") params.set("weeks", weeks);
  // Local or global only splits contributions.
  if (place !== "all" && of === "external") params.set("place", place);
  const search = params.toString();
  return `/leaderboard${search ? `?${search}` : ""}`;
}

/** The home board's choices, read off the page's filters. */
export function boardChoice(filters: ActivityFilters): LeaderboardChoice {
  const of = filters.scope === "own" || filters.kind === "commits" ? "own" : "external";
  // Local or global is only on /leaderboard.
  return { of, count: of === "own" ? "opened" : filters.count, weeks: filters.weeks, place: "all" };
}
