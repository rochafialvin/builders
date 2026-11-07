import type { MetadataRoute } from "next";
import { siteUrl } from "./content";

/**
 * What crawlers may visit. Without this file /robots.txt was a 404 — rendered
 * by the server, like any other page — and nothing kept crawlers off the
 * filtered addresses of the list pages, which are the same page over and over
 * (see app/lib/crawlers.ts). Pages behind a sign-in say noindex for
 * themselves; listing them here keeps crawlers from asking at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/*?", "/auth/", "/account/", "/admin", "/inbox", "/new", "/signin", "/signup", "/forgot-password", "/*/edit"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
