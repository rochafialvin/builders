/**
 * Where links may point. No Next.js imports here on purpose: these are plain
 * functions, and `tests/urls.test.mjs` exercises them directly.
 */

/**
 * Keeps a `?next=` destination inside this site. Anything absolute, protocol
 * relative, or otherwise off-site collapses to the board — an open redirect on
 * a sign-in page is how people get walked to a convincing fake one.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "https://ahsan.local");
    if (url.origin !== "https://ahsan.local") return "/";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}

/** Why linking or switching GitHub did not happen: refused, already another
 * member's, or the very account already linked. */
export type GitHubLinkFailure = "failed" | "taken" | "same";

/**
 * Back where somebody asked to link (or switch) GitHub, saying why it did not happen.
 * Not /signin: they are signed in already, and /signin sends anyone signed in
 * straight on to `next` — so the failure would vanish without a word.
 */
export function gitHubLinkFailedPath(next: string | null | undefined, reason: GitHubLinkFailure): string {
  const url = new URL(safeNextPath(next), "https://ahsan.local");
  url.searchParams.set("github-link", reason);
  return `${url.pathname}${url.search}#github-account`;
}

export function signInPath(next: string): string {
  const target = safeNextPath(next);
  return target === "/" ? "/signin" : `/signin?next=${encodeURIComponent(target)}`;
}

/**
 * Where somebody lands once they are signed in.
 *
 * A destination they actually asked for always wins: clicking "Saya tertarik"
 * on a project and signing in has to end up back on that project. Only a
 * plain sign-in, with nothing in mind, is sent to `/get-started` — which forwards
 * to the board on its own once there is nothing left to do there.
 */
export function startPath(next: string | null | undefined): string {
  const target = safeNextPath(next);
  return target === "/" ? "/get-started" : target;
}

/** The routes that know what to do with an authorization code. */
export const CALLBACK_PATH = "/auth/callback";
export const CONFIRM_PATH = "/auth/confirm";
/** Where GitHub returns its code, to be passed on to Supabase untouched. */
export const GITHUB_RETURN_PATH = "/auth/github/return";

/**
 * What to do with an OAuth `code` that turned up on the wrong page.
 *
 * A code only means something to `/auth/callback`. Anywhere else it sits in the
 * URL doing nothing — the person is not signed in, and the only evidence is a
 * page that behaves as though they never tried. This turns that dead end into
 * one of two outcomes, and which one depends on whether they already have a
 * session:
 *
 *   - no session → send the code where it can be spent, keeping `next` so they
 *     still land where they were going;
 *   - session already → do **not** try to spend it. A code is single use, so a
 *     spent one fails, and failing would throw somebody who is already signed
 *     in back to the sign-in page. Strip it from the URL instead.
 *
 * That second branch is also how a used code stops being kept: left alone it
 * stays in browser history and rides along in the `Referer` header of every
 * link clicked from that page.
 *
 * `null` means leave the request alone.
 */
export function strayCodeTarget(
  pathname: string,
  search: URLSearchParams,
  signedIn: boolean,
): { pathname: string; search: string } | null {
  const code = search.get("code");
  // A code belongs on these, which spend it themselves: redirecting the
  // callback to itself loops, moving a confirmation link to the callback
  // would drop it back on `/auth/confirm` afterwards with nothing left to
  // confirm, and GitHub's code on its return route is meant for Supabase —
  // spent at our callback it is not a Supabase code and the sign-in fails.
  if (!code || pathname === CALLBACK_PATH || pathname === CONFIRM_PATH || pathname === GITHUB_RETURN_PATH) {
    return null;
  }

  if (signedIn) {
    const cleaned = new URLSearchParams(search);
    cleaned.delete("code");
    return { pathname, search: cleaned.toString() };
  }

  const forwarded = new URLSearchParams();
  forwarded.set("code", code);
  const next = search.get("next");
  // Where they were headed, unless the answer is this page — following a code
  // back to the page it was stranded on would strand it there again.
  const destination = safeNextPath(next ?? pathname);
  if (destination !== "/") forwarded.set("next", destination);

  return { pathname: CALLBACK_PATH, search: forwarded.toString() };
}

/**
 * Returns a consistently sized favicon for a public project website.
 *
 * Only ordinary web URLs qualify. Besides avoiding nonsense image requests,
 * this means a forged form submission cannot turn the card image into an
 * unexpected protocol such as javascript: or data:.
 */
export function faviconUrl(value: string | null | undefined): string {
  if (!value) return "";

  try {
    const website = new URL(value);
    if (website.protocol !== "http:" && website.protocol !== "https:") return "";

    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(website.origin)}&sz=128`;
  } catch {
    return "";
  }
}

/** Only ordinary public web URLs may be loaded as project artwork. */
export function projectLogoUrl(value: string | null | undefined): string {
  if (!value) return "";

  try {
    const logo = new URL(value);
    return logo.protocol === "http:" || logo.protocol === "https:" ? logo.toString() : "";
  } catch {
    return "";
  }
}

/**
 * An absolute `http(s)` origin, or `null` for anything else. Path, query, and
 * trailing slash are dropped: only scheme, host, and port survive.
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The one address a sign-in should start from, when the deployment names one.
 *
 * A site answers to more than one name — a custom domain, the `*.netlify.app`
 * subdomain behind it, and a per-deploy permalink like
 * `<deploy-id>--<site>.netlify.app`. Every name serves the same app, so
 * anything can be reached from any of them; a sign-in cannot. The PKCE code
 * verifier is a cookie, cookies belong to one host, and a round trip that
 * leaves from one name and returns on another finds nothing where the verifier
 * should be. That is `origin-mismatch` on the sign-in page.
 *
 * So `/auth/google` moves somebody to this origin *before* it writes the
 * verifier, and builds its callback from it. Nothing else is pinned: the
 * callback, the confirmation links, and every redirect in between stay on
 * whatever host the browser is actually using.
 *
 * `null` means no name is nominated and the request's own origin is used, which
 * is the right answer for local development and for a preview deploy.
 */
export function pinnedOrigin(env: Record<string, string | undefined>): string | null {
  const configured = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  // Netlify puts the site's primary address in `URL`. Only trust it in the
  // production context: on a deploy preview it still points at production, and
  // sending a reviewer there would sign them in to the wrong site entirely.
  if (env.CONTEXT === "production") return normalizeOrigin(env.URL);

  return null;
}

/**
 * The origin the *browser* asked for, read from the request's own headers.
 *
 * Not `request.url` or `request.nextUrl.origin`: those are the address the
 * server was invoked with, and behind a hosting layer that can be an internal
 * name — on Netlify, the deploy's own `<deploy-id>--<site>.netlify.app`
 * permalink — even when nobody ever typed it. Cookies belong to the host in
 * the address bar, so anything a sign-in depends on has to be built from this.
 *
 * A chain of proxies appends to `x-forwarded-host`, and the first entry is the
 * one the browser used. Anything that does not parse as an ordinary web origin
 * is refused rather than passed on to `new URL`.
 */
export function originFromHeaders(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-host") ?? headers.get("host");
  const host = forwarded?.split(",")[0]?.trim();
  if (!host) return null;

  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return normalizeOrigin(`${headers.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`);
}
