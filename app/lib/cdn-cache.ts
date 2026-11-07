/**
 * Netlify's CDN keeps the public pages for guests.
 *
 * Every page here renders per request — the root layout reads the language
 * and theme cookies — so without this each view of the home page, a profile
 * or a share card woke the server function, and crawlers made sure there were
 * views around the clock. A guest's page is the same for every guest who
 * picked the same language and theme, so the CDN can answer it: the server
 * renders each address about once an hour, and stale copies are served while
 * it does.
 *
 * Only for guests. The rule applies when the request carries no Supabase
 * session cookie, and the session cookies are in `Netlify-Vary` too, so a
 * signed-in member never matches a guest's copy and always gets their own,
 * fresh page. That is also why a member sees their own edit at once; guests
 * see it within the hour. GitHub activity itself only changes every six hours
 * (20261106000000_github_activity_every_six_hours.sql).
 *
 * `@netlify/plugin-nextjs` keeps a `Netlify-CDN-Cache-Control` the response
 * already has and merges our `Netlify-Vary` with its own, which already keys
 * React Server Component requests apart from documents.
 */

import { LANGUAGE_COOKIE } from "./locale";
import { THEME_COOKIE } from "./theme";

/** How long the CDN answers from its copy, and how long past that it may while one is rendered. */
export const GUEST_CACHE = "public, durable, s-maxage=3600, stale-while-revalidate=86400";

/**
 * The pages anyone can see, signed in or not. Account, inbox, sign-in, the
 * forms and their redirects are left out: they are either a member's own or
 * short-lived.
 */
export const GUEST_CACHED_PATHS = [
  "/",
  "/directory",
  "/directory/:owner/:repo",
  "/directory/:owner/:repo/card",
  "/leaderboard",
  "/recommend",
  "/u/:username",
  "/projects/:slug",
  "/about",
  "/community",
  "/how-it-works",
  "/privacy",
  "/opengraph-image",
  "/twitter-image",
  "/:path*/opengraph-image",
  "/:path*/twitter-image",
] as const;

/**
 * Supabase's session cookie for this project: `sb-<ref>-auth-token`, split
 * into `.0`, `.1`… when the token outgrows one cookie. A first chunk is
 * always `.0`, so these two are enough to tell a session is there.
 */
export function sessionCookieNames(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  let ref: string;
  try {
    ref = new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return [];
  }
  if (!ref) return [];
  const base = `sb-${ref}-auth-token`;
  return [base, `${base}.0`, `${base}.1`, `${base}.2`];
}

/** What a guest's copy is keyed by, besides the address and its query. */
export function guestVary(sessionCookies: string[]): string {
  return `query, cookie=${[LANGUAGE_COOKIE, THEME_COOKIE, ...sessionCookies].join("|")}`;
}
