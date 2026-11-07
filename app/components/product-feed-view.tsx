"use client";

import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "./responsive-link";
import { InstantLink, InstantNav } from "./instant-link";
import { ProjectLogo } from "./project-logo";
import { ReactionBar } from "./reaction-bar";
import { RelativeTime } from "./relative-time";
import { activityPath, readActivityFilters, readActivityPage } from "../lib/activity-url";
import { FEED_KINDS, dayLabel, feedDays, feedKindLabel, feedLine, feedPage, groupProductFeed, type FeedEvent } from "../lib/product-feed";
import { eventReactionKey, type ReactionCount } from "../lib/reactions";
import { tx, type Locale } from "../lib/locale";

export type FeedProductLook = { logoUrl: string; website: string };

/** How many product-day cards one page of the feed shows. */
const PAGE_SIZE = 60;

/**
 * The builders site's activity: one card per product per day, saying what
 * happened on it in the trail's own words — added, moved to a stage, an
 * update, a role opened or filled — with reactions under each card. Laid out
 * like the open source site's PR feed (the `ax-` timeline), so the two read as
 * one family.
 *
 * The page hands it every feed event once; the kind chips and the pages are
 * then a re-render in the browser, the address following each choice — the
 * same arrangement as ActivityView.
 */
export function ProductFeedView({
  entries,
  looks,
  reactions,
  viewerName,
  today,
  locale,
}: {
  /** Every feed event; the view groups, filters and pages them. */
  entries: FeedEvent[];
  looks: Record<string, FeedProductLook>;
  reactions: Record<string, ReactionCount[]>;
  viewerName: string | null;
  today: string;
  locale: Locale;
}) {
  const searchParams = useSearchParams();
  const current = readActivityFilters(searchParams);
  const results = useRef<HTMLUListElement>(null);

  // A chip or a page turn is a re-render, not a round trip; the address
  // follows, so a filtered view can still be shared, reloaded and gone back from.
  const navigate = useCallback((href: string) => {
    const url = new URL(href, window.location.href);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    // The list changed under the reader; if its top has scrolled away, bring it back.
    const list = results.current;
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start" });
  }, []);

  const days = useMemo(() => groupProductFeed(entries, "Asia/Jakarta", current.feed), [entries, current.feed]);
  const requested = readActivityPage(searchParams);
  const { page, pages, shown } = useMemo(() => feedPage(days, requested, PAGE_SIZE), [days, requested]);

  return (
    <InstantNav navigate={navigate}>
      <ul ref={results} className="ax-chips" aria-label={tx(locale, "Jenis kabar", "Kind of news")}>
        {[...([""] as const), ...FEED_KINDS].map((feed) => (
          <li key={feed || "all"}>
            <InstantLink href={activityPath({ feed })} aria-current={current.feed === feed ? "true" : undefined}>
              {feed ? feedKindLabel(feed, locale) : tx(locale, "Semua", "All")}
            </InstantLink>
          </li>
        ))}
      </ul>

      {shown.length === 0 ? (
        <div className="ax-note">
          {current.feed ? (
            <>
              <p>{tx(locale, "Tidak ada kabar yang cocok.", "No matching news.")}</p>
              <p>
                <InstantLink href={activityPath({ feed: "" })}>{tx(locale, "Reset filter", "Reset filters")}</InstantLink>
              </p>
            </>
          ) : (
            <>
              <p>{tx(locale, "Belum ada kabar dari produk member.", "No news from members' products yet.")}</p>
              <p>
                {tx(locale, "Punya produk? ", "Building one? ")}
                <Link href="/new">{tx(locale, "Daftarkan, lalu tulis kabar terbarunya.", "List it, then post its latest news.")}</Link>
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="ax-timeline">
          {feedDays(shown).map(({ day, entries: onDay }) => (
            <section key={day} className="ax-day" aria-labelledby={`day-${day}`}>
              <h2 id={`day-${day}`} className="ax-day-title">
                {dayLabel(day, today, locale)}
              </h2>
              <ol className="ax-events">
                {onDay.map((entry) => {
                  const key = eventReactionKey(entry.firstEventId);
                  const look = looks[entry.product.slug];
                  return (
                    <li key={key} className="ax-event">
                      <ProjectLogo
                        className="pfeed-logo"
                        title={entry.product.title}
                        website={look?.website ?? ""}
                        logoUrl={look?.logoUrl ?? ""}
                        fallback={entry.product.title.slice(0, 1).toUpperCase()}
                      />
                      <div className="ax-event-body">
                        <p className="ax-event-line">
                          {entry.product.slug ? (
                            <Link className="ax-who" href={`/projects/${entry.product.slug}`}>
                              {entry.product.title}
                            </Link>
                          ) : (
                            <strong className="ax-who">{entry.product.title}</strong>
                          )}
                          <span className="ax-time">
                            <RelativeTime value={entry.at} locale={locale} />
                          </span>
                        </p>
                        <ul className="pfeed-lines">
                          {/* Oldest first within the day, so the card reads as it happened. */}
                          {[...entry.events].reverse().map((event) => (
                            <li key={event.id} className={`pfeed-line pfeed-${event.kind}`}>
                              {event.actor ? <Link href={`/u/${event.actor.username}`}>{event.actor.name || `@${event.actor.username}`}</Link> : tx(locale, "Seseorang", "Somebody")}{" "}
                              {feedLine(event, locale)}
                            </li>
                          ))}
                        </ul>
                        <ReactionBar url={key} initial={reactions[key] ?? []} viewerName={viewerName} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {pages > 1 ? (
        <nav className="dx-pager" aria-label={tx(locale, "Halaman", "Pages")}>
          {page > 1 ? (
            <InstantLink href={activityPath({ feed: current.feed }, page - 1)} rel="prev">
              <span aria-hidden="true">←</span> {tx(locale, "Sebelumnya", "Previous")}
            </InstantLink>
          ) : (
            <span aria-hidden="true" />
          )}
          <p>{tx(locale, `Halaman ${page} dari ${pages}`, `Page ${page} of ${pages}`)}</p>
          {page < pages ? (
            <InstantLink href={activityPath({ feed: current.feed }, page + 1)} rel="next">
              {tx(locale, "Berikutnya", "Next")} <span aria-hidden="true">→</span>
            </InstantLink>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      ) : null}
    </InstantNav>
  );
}
