import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resilientSupabaseFetch } from "./resilient-fetch";
import { sameOriginRedirect } from "./redirect";
import { siteOrigin } from "./origin";
import { gitHubLinkFailedPath, pinnedOrigin, safeNextPath } from "./urls";
import { authCookieOptions, site } from "./site";

export type OAuthProvider = "google" | "github";

/**
 * Marks the one bounce a start route is allowed to make, so a hosting layer
 * that reports a host we disagree with costs a single extra redirect instead
 * of an endless loop.
 */
const PINNED = "origin";

/**
 * Starts an OAuth sign-in, and hands the browser the cookie that finishes it.
 *
 * Called from a route handler rather than a server action, and the difference
 * is the whole point. `signInWithOAuth` generates the PKCE code verifier and
 * writes it as a cookie; `/auth/callback` reads it back to trade the
 * authorization code for a session. Lose that cookie anywhere in between and
 * the callback fails saying the verifier is missing — which reads like a
 * misconfigured redirect URL and is not one.
 *
 * As a server action the write had to survive being attached to an action
 * response that then redirects off-site, through a client-side navigation and
 * a hosting layer, before the browser ever stored it. Here the verifier is set
 * on the very redirect that sends somebody to the provider: one response,
 * carrying both the destination and the cookie that will make the return trip
 * work.
 *
 * Somebody already signed in who asks for GitHub is linking it to the account
 * they have, not signing in as somebody else: their Google or email account
 * gains a GitHub identity, and the callback records their GitHub handle.
 * Linking needs "Manual linking" switched on in
 * Supabase → Authentication → Sign In / Providers.
 */
export async function startOAuth(request: NextRequest, provider: OAuthProvider): Promise<NextResponse> {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  // GitHub only: link another GitHub account in place of the one linked. The
  // callback then unlinks the old one.
  const switching = provider === "github" && request.nextUrl.searchParams.get("switch") === "1";

  // Where the whole round trip has to happen: the verifier written below and
  // the callback that reads it back must be the same host, and this is the
  // only moment either can still be chosen. Nothing is written yet, so moving
  // somebody now costs a redirect and nothing else. See `pinnedOrigin`.
  const browser = await siteOrigin();
  const pinned = pinnedOrigin(process.env);
  if (pinned && pinned !== browser && request.nextUrl.searchParams.get(PINNED) !== "utama") {
    const start = new URL(`/auth/${provider}`, pinned);
    start.searchParams.set("next", next);
    if (switching) start.searchParams.set("switch", "1");
    start.searchParams.set(PINNED, "utama");
    return NextResponse.redirect(start);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return refuse(provider, next);

  // Collected rather than written through `cookies()`: these have to land on
  // the redirect below, and nowhere else.
  const pending: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient(url, anonKey, {
    global: { fetch: resilientSupabaseFetch },
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pending.push(...cookiesToSet);
      },
    },
  });

  // The origin the browser is on, not the one this function was invoked with:
  // the verifier is stored against the host in the address bar, so the callback
  // has to come back to that host. `request.nextUrl.origin` is the invoking
  // address, which behind Netlify can be the deploy's own permalink even when
  // nobody ever typed it. See `siteOrigin()` in app/lib/origin.ts.
  const callback = new URL("/auth/callback", pinned ?? browser);
  callback.searchParams.set("next", next);
  callback.searchParams.set("via", provider);

  const options = { redirectTo: callback.toString(), skipBrowserRedirect: true };
  let started: { url: string | null; error: unknown };
  let linking = false;

  if (provider === "github") {
    const { data: viewer } = await supabase.auth.getUser();
    const linked = viewer.user?.identities?.some((identity) => identity.provider === "github");
    if (viewer.user && (!linked || switching)) {
      linking = true;
      const { data, error } = await supabase.auth.linkIdentity({ provider, options });
      started = { url: data.url, error };
    } else {
      // Signed out, or GitHub already linked and not being switched: signing
      // in with it lands on the same account.
      const { data, error } = await supabase.auth.signInWithOAuth({ provider, options });
      started = { url: data.url, error };
    }
  } else {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider, options });
    started = { url: data.url, error };
  }

  if (started.error || !started.url) {
    console.error(`[builders] ${provider} OAuth could not start.`, started.error);
    return linking ? sameOriginRedirect(gitHubLinkFailedPath(next, "failed")) : refuse(provider, next);
  }

  if (!pending.some(({ name }) => name.endsWith("-code-verifier"))) {
    // Without a verifier the round trip cannot succeed, and the provider would
    // send them back to a failure. Better to stop here than to spend
    // somebody's time proving it.
    console.error(`[builders] No PKCE verifier was created; ${provider} OAuth was cancelled.`);
    return linking ? sameOriginRedirect(gitHubLinkFailedPath(next, "failed")) : refuse(provider, next);
  }

  const destination = provider === "github" ? await viaOurDomain(started.url, pinned ?? browser) : started.url;
  const response = NextResponse.redirect(destination);
  for (const { name, value, options: cookie } of pending) {
    response.cookies.set(name, value, cookie);
  }
  return response;
}

/**
 * Where GitHub may send somebody back to us rather than to Supabase: both
 * sites (see lib/site.ts) and local development. Each one has to be
 * registered as a redirect URI on the GitHub App, next to Supabase's own
 * callback — an unregistered one makes GitHub refuse the sign-in.
 */
const GITHUB_RETURN_ORIGINS = new Set([
  "https://builders.swegrowth.id",
  "https://oss.swegrowth.id",
  site.url,
  "http://localhost:3000",
]);

/**
 * The GitHub authorize URL, but coming back through this site.
 *
 * GitHub's consent screen ends with "Authorizing will redirect to …" and
 * names the redirect URI's host; through Supabase that is
 * `<ref>.supabase.co`, which reads like somebody else's site. So the
 * redirect URI is swapped for /auth/github/return here, which hands GitHub's
 * `code` and `state` straight on to Supabase's callback — the same request
 * Supabase would have received, one hop later. Supabase then trades the code
 * with its own (also registered) redirect URI, which GitHub accepts.
 *
 * Any surprise — an origin not registered, an answer of an unexpected shape —
 * falls back to the untouched URL: the sign-in still works, it just names
 * Supabase.
 */
async function viaOurDomain(start: string, origin: string): Promise<string> {
  if (!GITHUB_RETURN_ORIGINS.has(origin)) return start;
  try {
    let authorize = new URL(start);
    if (authorize.hostname !== "github.com") {
      // signInWithOAuth's URL is Supabase's /authorize, which answers with a
      // redirect to GitHub; linkIdentity's already points at GitHub.
      const answer = await fetch(start, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      const location = answer.headers.get("location");
      if (!location) return start;
      authorize = new URL(location);
    }
    if (authorize.hostname !== "github.com" || !authorize.searchParams.has("redirect_uri")) return start;
    authorize.searchParams.set("redirect_uri", new URL("/auth/github/return", origin).toString());
    return authorize.toString();
  } catch {
    return start;
  }
}

function refuse(provider: OAuthProvider, next: string): NextResponse {
  const failure = new URLSearchParams({ error: `${provider}-failed` });
  if (next !== "/") failure.set("next", next);
  return sameOriginRedirect(`/signin?${failure}`);
}
