/**
 * Crawlers and the filtered addresses of the list pages.
 *
 * The home feed, the directory and the leaderboard filter in the browser, so
 * every `?member=`, `?repo=`, `?page=` and `?lang=` is a link — and a crawler
 * following them walks members × repos × spans × pages, each one a full server
 * render of the same page. On oss.swegrowth.id that was around half a million
 * requests a week, day and night, and most of the site's Netlify credits.
 *
 * robots.txt asks crawlers to stay off query strings (app/robots.ts). This is
 * for the ones that do not ask: a crawler that names itself is sent to the
 * page without the query, which the proxy answers without waking the server.
 * Nothing is lost by it — the server renders the same page whatever the
 * query says; the filters are applied in the browser.
 */

/** The list pages whose query is only ever a filter. */
const FILTERED_PATHS = new Set(["/", "/directory", "/leaderboard"]);

/**
 * Names crawlers give themselves: the generic words, and the big ones that
 * leave them out of their user agent.
 */
const CRAWLER = /bot\b|bot\/|crawl|spider|slurp|scrapy|bytespider|facebookexternalhit|meta-externalagent|headlesschrome|python-requests|go-http-client|okhttp|curl\/|wget\//i;

export function isCrawler(userAgent: string | null): boolean {
  return Boolean(userAgent && CRAWLER.test(userAgent));
}

/**
 * Where to send a crawler asking for a filtered list page — the same page
 * without its query — or `null` when the request can go through as it is.
 */
export function crawlerTarget(pathname: string, search: string, userAgent: string | null): string | null {
  if (!search || search === "?") return null;
  if (!FILTERED_PATHS.has(pathname)) return null;
  return isCrawler(userAgent) ? pathname : null;
}
