import type { NextConfig } from "next";
import { builderUrl, isOss, ossUrl } from "./app/lib/site";
import { GUEST_CACHE, GUEST_CACHED_PATHS, guestVary, sessionCookieNames } from "./app/lib/cdn-cache";

const sessionCookies = sessionCookieNames(process.env.NEXT_PUBLIC_SUPABASE_URL);

/**
 * Cache Components is what makes this site cheap to serve.
 *
 * Every route used to carry `dynamic = "force-dynamic"`, so each page view
 * re-read Supabase from scratch — including the two story pages, which have no
 * database reads at all. With `cacheComponents` on, each route prerenders a
 * static shell, the public reads in `app/lib/data.ts` are cached and shared
 * across visitors, and only the parts that genuinely depend on who is looking
 * (the header, the inbox, an application state) stream in at request time.
 *
 * The profiles below name the shapes of data this site has, so a call site
 * reads as an intent rather than a number. All three are also invalidated on
 * demand: every write in `app/actions.ts` calls `updateTag`, so an edit shows
 * up immediately and the durations are only the ceiling for changes that
 * happen outside the app.
 */
const nextConfig: NextConfig = {
  cacheComponents: true,
  // A guest's public page from Netlify's CDN rather than the server; see
  // app/lib/cdn-cache.ts. Without the session cookie's name there is no way
  // to keep members off a guest's copy, so nothing is cached then.
  async headers() {
    if (sessionCookies.length === 0) return [];
    return GUEST_CACHED_PATHS.map((source) => ({
      source,
      missing: sessionCookies.map((key) => ({ type: "cookie" as const, key })),
      headers: [
        { key: "Netlify-CDN-Cache-Control", value: GUEST_CACHE },
        { key: "Netlify-Vary", value: guestVary(sessionCookies) },
      ],
    }));
  },
  async redirects() {
    return [
      // The open source site has none of the work of running a product: its
      // pages live on the builders site, so a link to one still lands. Not
      // permanent, so moving a page between the two stays possible. The query
      // string goes along by default.
      ...(isOss
        ? [
            { source: "/new", destination: builderUrl("/new"), permanent: false },
            { source: "/projects/:path*", destination: builderUrl("/projects/:path*"), permanent: false },
            { source: "/inbox", destination: builderUrl("/inbox"), permanent: false },
            { source: "/how-it-works/roles", destination: builderUrl("/how-it-works"), permanent: false },
            { source: "/", has: [{ type: "query" as const, key: "track", value: "role" }], destination: builderUrl("/directory"), permanent: false },
            { source: "/directory", has: [{ type: "query" as const, key: "track", value: "role" }], destination: builderUrl("/directory"), permanent: false },
            { source: "/explore", destination: builderUrl("/directory?track=role"), permanent: false },
            { source: "/kolaborasi", destination: builderUrl("/directory?track=role"), permanent: false },
            // Its "add a project" is suggesting a repo.
            { source: "/submit", destination: "/recommend", permanent: false },
            // Browsers ask for these by name, whatever the page links; the
            // open source site's are the pull request mark (app/layout.tsx).
            { source: "/favicon.ico", destination: "/oss-favicon.ico", permanent: false },
            { source: "/apple-touch-icon.png", destination: "/oss-apple-touch-icon.png", permanent: false },
          ]
        : [
            // And the builders site has none of GitHub's: the repo catalogue
            // lives on the open source site. Its /activity is a product feed.
            { source: "/recommend", destination: ossUrl("/recommend"), permanent: false },
            // The leaderboard is open source contributions, the open source site's.
            { source: "/leaderboard", destination: ossUrl("/leaderboard"), permanent: false },
            // Its "add a project" is listing a product; its walk-through is the roles one.
            { source: "/submit", destination: "/new", permanent: false },
            { source: "/how-it-works/roles", destination: "/how-it-works", permanent: false },
          ]),
      // Activity is the home page now and the directory has its own address.
      // Old links to /activity land on the home page, and old directory links
      // — `/` with a filter only the directory reads — on /directory. Not
      // permanent, so the two can still trade places. `scope` is both pages':
      // only the directory's values move.
      { source: "/activity", destination: "/", permanent: false },
      ...["track", "open", "pr", "badge", "facet", "phase", "sort", "source"].map((key) => ({
        source: "/",
        has: [{ type: "query" as const, key }],
        destination: "/directory",
        permanent: false,
      })),
      { source: "/", has: [{ type: "query" as const, key: "scope", value: "local|global" }], destination: "/directory", permanent: false },
      // The old board and the talent pool are gone; the directory covers both.
      { source: "/explore", destination: "/directory?track=role", permanent: true },
      { source: "/kolaborasi", destination: "/directory?track=role", permanent: true },
      { source: "/people", destination: "/directory", permanent: true },
      { source: "/orang", destination: "/directory", permanent: true },
      { source: "/mulai", destination: "/get-started", permanent: true },
      { source: "/lupa-password", destination: "/forgot-password", permanent: true },
      { source: "/akun/profil", destination: "/account/profile", permanent: true },
      { source: "/akun/password", destination: "/account/password", permanent: true },
    ];
  },
  // Let a Link start upgrading an unseen dynamic detail route while it is in
  // view. That makes a click from Explore feel instant even when the project
  // was created after the last deployment and therefore was not pre-rendered
  // below yet.
  partialPrefetching: true,
  experimental: {
    // Going back to a page seen in the last two minutes — Home, Explore,
    // People, a profile — shows it from the browser instead of waiting on
    // the server again. Every write still clears this at once (updateTag and
    // revalidatePath in app/actions.ts), so it only ever repeats a page
    // nothing has changed since.
    staleTimes: { dynamic: 120 },
    // No `inlineCss`: with it on, the ~160 KB stylesheet was written into the
    // HTML once as a <style> and again, three times, in the React payload —
    // 737 KB of HTML on the home page against 80 KB without it. Mobile
    // Lighthouse (simulated slow 4G): 91 -> 96, FCP 1.3 s -> 1.1 s, TBT
    // 130 ms -> 45 ms. The separate CSS request is cached after the first visit.
    // Turbopack's filesystem cache (on by default since 16.3) kept serving a
    // stale globals.css: Netlify restores `.next/cache` between deploys, and a
    // build shipped new HTML with an old stylesheet — the leaderboard and
    // footer unstyled in production. The same happened to `next dev` after
    // switching branches. Off for both: a slower build that is always right.
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
  },
  cacheLife: {
    // The board, the people directory, a project page. Someone posting a
    // project wants to see it appear; the tag invalidation covers that, and
    // this is the backstop for rows that changed in the database directly.
    board: {
      // Keep public discovery results in the browser Router Cache long enough
      // that moving among Home, Explore, and People does not fetch them again.
      // A write still clears this immediately through updateTag/revalidatePath.
      stale: 300,
      revalidate: 300,
      expire: 3600,
    },
    // Facets rebuilt from the same rows the board already reads: topic counts,
    // open-role suggestions. A new topic appearing a few minutes late costs
    // nothing, and these are the most expensive reads to repeat.
    facets: {
      stale: 300,
      revalidate: 900,
      expire: 86400,
    },
    // A member's work as GitHub tells it, on their profile: read from GitHub's
    // API with the site's token, so asked for at most hourly per member.
    github: {
      stale: 300,
      revalidate: 3600,
      expire: 86400,
    },
    // A person's public trail. Append-only in practice, and never urgent.
    trail: {
      stale: 300,
      revalidate: 1800,
      expire: 86400,
    },
  },
};

export default nextConfig;
