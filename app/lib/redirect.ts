import { NextResponse } from "next/server";
import { safeNextPath } from "./urls";

/**
 * A redirect that keeps the browser on the host it is already using.
 *
 * `NextResponse.redirect` wants an absolute URL, and the only absolute URL at
 * hand is `request.url` — the address the *server* was invoked with, which is
 * not always the one in the address bar. Behind Netlify they come apart: a
 * request to the site's primary name can reach the function as that deploy's
 * own `<deploy-id>--<site>.netlify.app` address, so a redirect built from it
 * quietly moves somebody to a second name for the same site.
 *
 * Mid sign-in that is fatal. The PKCE verifier and the session cookies belong
 * to the host they were written on, so changing host between the start and the
 * exchange loses them — a completed Google login landing on
 * `/signin?error=origin-mismatch` is this bug, not a Supabase misconfiguration.
 *
 * A `Location` header is allowed to be a path (RFC 9110 §10.2.2) and the
 * browser resolves it against the address it actually asked for, which is the
 * one that matters. Cookies set through `cookies()` still ride along.
 *
 * `base` is for `proxy.ts` alone: Next resolves a proxy redirect itself and
 * insists on an absolute URL there, so that layer passes the origin it read
 * from the request headers. It relativizes the header again when the host
 * matches the request, which is the same trick by a longer route.
 */
export function sameOriginRedirect(path: string, base?: string, status: 301 | 307 = 307): NextResponse {
  // Belt and braces: a `Location` that starts with `//` is another origin, and
  // these paths are built from `?next=` values.
  const target = path.startsWith("/") && !path.startsWith("//") ? path : safeNextPath(path);
  return new NextResponse(null, {
    status,
    headers: { Location: base ? new URL(target, base).toString() : target },
  });
}
