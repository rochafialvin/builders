import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resilientSupabaseFetch } from "./app/lib/resilient-fetch";
import { sameOriginRedirect } from "./app/lib/redirect";
import { crawlerTarget } from "./app/lib/crawlers";
import { originFromHeaders, strayCodeTarget } from "./app/lib/urls";
import { isLocale, LANGUAGE_COOKIE, LANGUAGE_PARAM } from "./app/lib/locale";
import { authCookieOptions } from "./app/lib/site";

/**
 * Keeps the Supabase session cookie fresh.
 *
 * Access tokens are short lived. Server Components cannot write cookies, so
 * without this the refreshed token would be thrown away on every render and
 * people would get signed out mid-visit.
 */
export async function proxy(request: NextRequest) {
  // A crawler on a filtered list page gets the page without the filter, here,
  // before the server is woken to render the same page again. See crawlers.ts.
  const plain = crawlerTarget(request.nextUrl.pathname, request.nextUrl.search, request.headers.get("user-agent"));
  if (plain) return sameOriginRedirect(plain, browserOrigin(request), 301);

  // An OAuth code that landed anywhere but /auth/callback. Supabase falls back
  // to the Site URL when a redirect target is not on its allow list, so a
  // missing entry there drops the code on the home page, where nothing spends
  // it and the visitor simply stays signed out with no idea why. Send it where
  // it can be spent — or, if they are already signed in, take the spent code
  // out of the URL rather than fail on it. See strayCodeTarget.
  const stray = strayCodeTarget(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
    hasSessionCookie(request),
  );
  if (stray) {
    // Same host, deliberately: the code is about to be spent against a verifier
    // cookie that only exists on the host the browser is on. `nextUrl` is the
    // address this function was invoked with, which is not always that host.
    return sameOriginRedirect(
      stray.search ? `${stray.pathname}?${stray.search}` : stray.pathname,
      browserOrigin(request),
    );
  }

  // A ?lang= on the URL is how the language switcher asks for a page in the
  // other language. Applying it to the request cookies here is what lets the
  // switch be an ordinary navigation: every Server Component below reads the
  // asked-for language, and the router treats the result as a page it can
  // prefetch — which is why the header can have it ready before the click.
  //
  // It is deliberately not written to the response. <Link prefetch> fetches
  // this URL before anybody clicks it, and a Set-Cookie there would change the
  // language unasked. The browser writes the cookie once the language is
  // actually being shown; see LanguageProvider.
  const asked = request.nextUrl.searchParams.get(LANGUAGE_PARAM) ?? undefined;
  if (isLocale(asked)) request.cookies.set(LANGUAGE_COOKIE, asked);

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  // A guest carries no auth cookie, so there is no session to refresh. Skipping
  // validation takes that work off every anonymous page view, which is most of
  // them.
  if (!hasSessionCookie(request)) return response;

  const supabase = createServerClient(url, anonKey, {
    global: { fetch: resilientSupabaseFetch },
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    // With the default asymmetric keys, getClaims() verifies locally after its
    // JWKS key has been cached. It still refreshes the cookie when needed;
    // symmetric-key projects fall back to an Auth request for verification.
    await supabase.auth.getClaims();
  } catch (error) {
    // A stale session must not make every public route unreachable when the
    // auth service is briefly unavailable. The page can continue as a guest;
    // writes still perform their own authenticated checks.
    console.error("[builders] Session refresh was skipped because Supabase Auth did not respond.", error);
  }

  return response;
}

/** The address the browser used, with the invoking address as a last resort. */
function browserOrigin(request: NextRequest): string {
  return originFromHeaders(request.headers) ?? request.nextUrl.origin;
}

/**
 * Whether this request carries a session at all.
 *
 * The `-code-verifier` cookie is deliberately excluded. It shares the
 * `sb-<ref>-auth-token` prefix but means the opposite thing: it is written when
 * a sign-in *starts*, so counting it would read a visitor mid-login as already
 * signed in — and the stray-code guard would then strip the very code it was
 * about to spend.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        cookie.name.includes("-auth-token") &&
        !cookie.name.includes("code-verifier"),
    );
}

export const config = {
  // Everything except static assets and the image optimiser.
  matcher: ["/((?!_next/static|_next/image|favicon.svg|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
