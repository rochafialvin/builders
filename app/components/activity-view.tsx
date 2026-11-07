"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "./responsive-link";
import { InstantLink, InstantNav } from "./instant-link";
import { RelativeTime } from "./relative-time";
import { ReactionBar } from "./reaction-bar";
import {
  activityPath,
  boardChoice,
  leaderboardPath,
  readActivityFilters,
  readActivityPage,
  type ActivityFilters,
  type LeaderboardChoice,
} from "../lib/activity-url";
import {
  activityPeople,
  dayKey,
  groupByDay,
  inScope,
  inWindow,
  repoSummaries,
  REPO_ORDERS,
  ownerAvatar,
  queryActivity,
  repoName,
  BOARD_COUNTS,
  BOARD_SPANS,
  boardEntries,
  SUMMARY_DAYS,
  boardWindow,
  isBoardSpan,
  isBoardCount,
  seasonBoard,
  type BoardCount,
  type BoardSpan,
  type BoardWindow,
  type OwnBoards,
  type CommitSummaryEntry,
  type ConsistencyRow,
  type GitHubActivityEntry,
  type PullRequestEntry,
  type RepoOrder,
  type PullRequestItem,
} from "../lib/github-activity";
import type { ReactionCount } from "../lib/reactions";
import { tx, type Locale } from "../lib/locale";
import { BoardInfo, Rank, ThisWeek, WeekDots } from "./week-dots";
import { repoPagePath } from "../lib/directory";

const PAGE_SIZE = 20;
/** Repositories shown under the leaderboard before "See all": a handful, not the list. */
const REPOS_SHOWN = 5;
/** How many repositories a commit summary names before "+N". */
const SUMMARY_REPOS = 4;
/** Pull requests listed in a grouped entry before the rest fold away. */
const PRS_SHOWN = 3;
/** How long typing rests before the address catches up. Browsers throttle history writes. */
const SEARCH_SETTLE_MS = 300;

/**
 * The /activity feed and its filters. The page hands it every entry once —
 * read from the server's shared cache — and from then on the scope toggle,
 * the sidebar, the search and the pages are a re-render in the browser, not
 * a round trip: the address follows every choice (`history.pushState`,
 * which the router keeps in step with `useSearchParams`), so a filtered view
 * can still be shared, reloaded, and gone back from. The directory works
 * the same way; see DirectoryView.
 */
export function ActivityView({
  entries,
  reactions,
  viewerName,
  today,
  locale,
  unavailable,
  viewerHandle = null,
  ownBoards,
  listed = [],
}: {
  entries: GitHubActivityEntry[];
  /** Per pull request URL, or per summary key. */
  reactions: Record<string, ReactionCount[]>;
  viewerName: string | null;
  /** Today in Jakarta, from the server, so "Today" and "Yesterday" match on both sides. */
  today: string;
  locale: Locale;
  unavailable: boolean;
  /** The signed-in member's GitHub handle, when they are shown here: their own row on the board. */
  viewerHandle?: string | null;
  /** The own-repos boards, from the server (see `ownBoards`). */
  ownBoards?: OwnBoards;
  /** The repos the directory lists, as `owner/name` in lower case: those have a page here. */
  listed?: string[];
}) {
  const searchParams = useSearchParams();
  const withPage = useMemo(() => new Set(listed), [listed]);
  const fromUrl = readActivityFilters(searchParams);
  // What is typed is held here and written to the address once typing rests:
  // the list follows every key, the history does not.
  const [q, setQ] = useState(fromUrl.q);
  const settle = useRef<number | undefined>(undefined);
  const results = useRef<HTMLElement>(null);

  // Back and Forward make the address the truth again.
  useEffect(() => {
    const onPop = () => {
      window.clearTimeout(settle.current);
      setQ(readActivityFilters(new URLSearchParams(window.location.search)).q);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.clearTimeout(settle.current);
    };
  }, []);

  const navigate = useCallback((href: string) => {
    const url = new URL(href, window.location.href);
    window.clearTimeout(settle.current);
    setQ(readActivityFilters(url.searchParams).q);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    // The list changed under the reader; if its top has scrolled away, bring it back.
    const list = results.current;
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start" });
  }, []);

  const search = (value: string, now = false) => {
    setQ(value);
    window.clearTimeout(settle.current);
    const write = () => window.history.replaceState(null, "", activityPath({ ...fromUrl, q: value.trim().slice(0, 100) }));
    if (now) write();
    else settle.current = window.setTimeout(write, SEARCH_SETTLE_MS);
  };

  const current = { ...fromUrl, q: q.slice(0, 100) };
  const boardWeeks = useMemo(() => boardWindow(today, current.weeks), [today, current.weeks]);
  // Everything else narrows within the scope and the weeks showing.
  const scoped = useMemo(() => inWindow(inScope(entries, current.scope), boardWeeks), [entries, current.scope, boardWeeks]);
  const people = useMemo(() => activityPeople(entries), [entries]);
  // The board counts contributions or PRs to their own repos; every PR
  // opened, or only those merged (see `boardChoice`).
  const choice = boardChoice(current);
  const board = useMemo(
    () =>
      choice.of === "own"
        ? (ownBoards?.[`${choice.weeks}:${choice.count}`] ?? [])
        : seasonBoard(boardEntries(entries, [], "external", choice.count), today, undefined, boardWeeks),
    [entries, ownBoards, choice.of, choice.count, choice.weeks, today, boardWeeks],
  );
  const matched = useMemo(
    () => queryActivity(scoped, current),
    [scoped, current.kind, current.member, current.repo, current.q], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // A search still settling has already left the page it started on.
  const requested = q === fromUrl.q ? readActivityPage(searchParams) : 1;
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  const page = Math.min(requested, pages);
  const shown = matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Narrowed by the feed's own filters; the board's choices are not undone by a reset.
  const filtered = Boolean(current.member || current.repo || current.q.trim());
  const reset = activityPath({ ...current, member: "", repo: "", q: "" });

  const memberName = people.find(({ person }) => person.handle.toLowerCase() === current.member.toLowerCase())?.person.name;
  // Who or where the feed is narrowed to, each with a way back.
  const chips = [
    ...(current.member ? [{ label: memberName || `@${current.member}`, href: activityPath({ ...current, member: "" }) }] : []),
    ...(current.repo ? [{ label: current.repo, href: activityPath({ ...current, repo: "" }) }] : []),
  ];

  return (
    <InstantNav navigate={navigate}>
      <ActivityControls choice={choice} current={current} locale={locale} navigate={navigate} />
      <div className="dx-layout ax-layout">
        {/* The left column: the leaderboard, and under it where the PRs went.
            On a phone the column comes apart: the board above the feed, the
            repos after it. */}
        <div className="ax-side">
          <Leaderboard
            rows={board}
            choice={choice}
            boardWeeks={boardWeeks}
            current={current}
            viewerHandle={viewerHandle}
            locale={locale}
          />

          <RepoList entries={scoped} current={current} listed={withPage} locale={locale} />
        </div>

        <section ref={results} className="dx-results" aria-labelledby="feed-title">
          {/* The feed under its own name: the page is the leaderboard, this is
              what the ranking is made of. */}
          <div className="ax-feed-head">
            <h2 id="feed-title">{tx(locale, "Aktivitas publik terbaru dari GitHub anggota", "Latest public activity from members' GitHub")}</h2>
            <p className="dx-count" role="status">
              <strong>{matched.length}</strong> {tx(locale, "aktivitas", "entries")}
              {filtered ? <> · <InstantLink href={reset}>reset</InstantLink></> : null}
            </p>
          </div>
          <div className="dx-toolbar ax-toolbar">
            <form
              className="dx-search"
              action="/"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                search(q, true);
              }}
            >
              <label>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <span className="sr-only">{tx(locale, "Cari aktivitas", "Search activity")}</span>
                <input
                  type="search"
                  name="q"
                  value={q}
                  onChange={(event) => search(event.target.value)}
                  placeholder={tx(locale, "Cari judul PR, repo, atau nama…", "Search PR titles, repos, or names…")}
                />
              </label>
            </form>
          </div>

          {chips.length > 0 ? (
            <ul className="ax-chips" aria-label={tx(locale, "Filter aktif", "Active filters")}>
              {chips.map((chip) => (
                <li key={chip.href}>
                  <InstantLink href={chip.href} aria-label={tx(locale, `Hapus filter ${chip.label}`, `Remove filter ${chip.label}`)}>
                    {chip.label} <span aria-hidden="true">×</span>
                  </InstantLink>
                </li>
              ))}
            </ul>
          ) : null}

          {unavailable ? (
            <p className="public-data-notice" role="status">
              {tx(locale, "Aktivitas belum dapat dimuat.", "The activity could not be loaded.")}{" "}
              <a href={activityPath(current, page)}>{tx(locale, "Muat ulang", "Reload")}</a>.
            </p>
          ) : null}

          {shown.length === 0 ? (
            <div className="dx-empty ax-empty">
              <p>
                {entries.length === 0
                  ? tx(locale, "Belum ada aktivitas yang tercatat. ", "No activity recorded yet. ")
                  : tx(locale, "Tidak ada aktivitas yang cocok. ", "No activity matches. ")}
                {filtered ? <InstantLink href={reset}>{tx(locale, "Reset filter", "Reset filters")}</InstantLink> : null}
              </p>
              <p>
                {tx(locale, "Mau muncul di sini? Isi GitHub-mu dan centang “Tampilkan aktivitas GitHub-ku” di ", "Want to show up here? Add your GitHub and tick “Show my GitHub activity” on ")}
                <Link href="/account/profile#github-account">{tx(locale, "halaman edit profil", "the edit profile page")}</Link>.
              </p>
            </div>
          ) : (
            <div className="ax-timeline">
              {timelineGroups(shown, today, locale).map(({ day, title, entries: onDay }) => (
                <section key={day} className="ax-day" aria-labelledby={`day-${day}`}>
                  <h2 id={`day-${day}`} className="ax-day-title">
                    {title}
                  </h2>
                  <ol className="ax-events">
                    {onDay.map((entry) => (
                      <li key={entry.key} className="ax-event">
                        <Avatar handle={entry.person.handle} size={32} />
                        {entry.kind === "pull_request" ? (
                          <PullRequestEvent entry={entry} listed={withPage.has(entry.repo)} locale={locale} reactions={reactions[entry.url] ?? []} viewerName={viewerName} />
                        ) : (
                          <CommitSummaryEvent entry={entry} today={today} locale={locale} reactions={reactions[entry.key] ?? []} viewerName={viewerName} />
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}

          {pages > 1 ? (
            <nav className="dx-pager" aria-label={tx(locale, "Halaman", "Pages")}>
              {page > 1 ? (
                <InstantLink href={activityPath(current, page - 1)} rel="prev">
                  <span aria-hidden="true">←</span> {tx(locale, "Sebelumnya", "Previous")}
                </InstantLink>
              ) : (
                <span aria-hidden="true" />
              )}
              <p>{tx(locale, `Halaman ${page} dari ${pages}`, `Page ${page} of ${pages}`)}</p>
              {page < pages ? (
                <InstantLink href={activityPath(current, page + 1)} rel="next">
                  {tx(locale, "Berikutnya", "Next")} <span aria-hidden="true">→</span>
                </InstantLink>
              ) : (
                <span aria-hidden="true" />
              )}
            </nav>
          ) : null}

          <p className="ax-note">
            {tx(locale, "Hanya repo publik, dan hanya member yang memilih tampil.", "Public repositories only, and only members who chose to be shown.")}
          </p>
        </section>
      </div>
    </InstantNav>
  );
}

/** Repos shown before "See all" on a phone, where the card sits above the feed. */
const REPOS_SHOWN_PHONE = 3;
/** Faces shown per repo before "+n". */
const FACES_SHOWN = 3;

/**
 * Where the pull requests in the feed went, as a card under the ranking: who
 * went there and how lately, not only how many PRs — newest first by default,
 * so one very busy repo does not sit on top for good, with most PRs and most
 * people a pill away. Each repo narrows the feed to it; long names stay on one
 * line, whole in the tooltip.
 */
function RepoList({
  entries,
  current,
  listed,
  locale,
}: {
  entries: GitHubActivityEntry[];
  current: ActivityFilters;
  listed: ReadonlySet<string>;
  locale: Locale;
}) {
  const [order, setOrder] = useState<RepoOrder>("recent");
  const [expanded, setExpanded] = useState(false);
  const repos = useMemo(() => repoSummaries(entries, order), [entries, order]);
  if (repos.length === 0) return null;
  // The repo being looked at is never folded away.
  const open = expanded || repos.findIndex(({ repo }) => repo === current.repo) >= REPOS_SHOWN_PHONE;
  const orderLabels: Record<RepoOrder, string> = {
    recent: tx(locale, "terbaru", "newest"),
    prs: tx(locale, "PR terbanyak", "most PRs"),
    people: tx(locale, "kontributor terbanyak", "most people"),
  };

  // No card: a plain list under the ranking, the way the directory's
  // sidebar lists read — a small title with the order beside it, then rows.
  return (
    <section className="ax-where" aria-labelledby="repos-title">
      <div className="ax-where-head">
        <h2 id="repos-title">{tx(locale, "Repo tujuan PR", "Where PRs went")}</h2>
        <label>
          <span className="sr-only">{tx(locale, "Urutkan repo", "Order repos")}</span>
          <select className="ax-where-order" value={order} onChange={(event) => setOrder(REPO_ORDERS.find((each) => each === event.target.value) ?? "recent")}>
            {REPO_ORDERS.map((each) => (
              <option key={each} value={each}>
                {orderLabels[each]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ol className={`ax-where-list ${open ? "is-expanded" : ""}`}>
        {repos.map(({ repo, prs, people, lastAt }) => {
          const on = current.repo === repo;
          return (
            <li key={repo} className={on ? "is-active" : ""}>
              <InstantLink href={activityPath({ ...current, repo: on ? "" : repo })} aria-current={on ? "true" : undefined} title={repo}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the repository owner's GitHub picture */}
                <img className="ax-where-logo" src={ownerAvatar(repo, 36)} alt="" width={20} height={20} loading="lazy" />
                <span className="ax-where-body">
                  <span className="ax-where-name">
                    <small>{repo.slice(0, repo.indexOf("/") + 1)}</small>
                    {repoName(repo)}
                  </span>
                  <span className="ax-where-meta">
                    <span className="ax-where-faces" aria-label={people.map((person) => person.name || person.handle).join(", ")}>
                      {people.slice(0, FACES_SHOWN).map((person) => (
                        <Avatar key={person.id} handle={person.handle} size={16} />
                      ))}
                      {people.length > FACES_SHOWN ? <span className="ax-where-more">+{people.length - FACES_SHOWN}</span> : null}
                    </span>
                    <span aria-hidden="true">·</span>
                    <RelativeTime value={lastAt} locale={locale} />
                  </span>
                </span>
                <span className="ax-where-count">{prs}</span>
              </InstantLink>
              {/* The row filters the feed; the repo it is filtered to also
                  offers its page here, when the directory lists it. */}
              {on && listed.has(repo) ? (
                <Link className="ax-where-page" href={repoPagePath(repo)}>
                  {tx(locale, "Halaman repo", "Repo page")} <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
      {repos.length > REPOS_SHOWN_PHONE ? (
        <button
          type="button"
          className={`ax-where-toggle ${repos.length <= REPOS_SHOWN ? "is-phone-only" : ""}`}
          aria-expanded={open}
          onClick={() => setExpanded((was) => !was)}
        >
          {open ? tx(locale, "Tampilkan lebih sedikit", "Show fewer") : tx(locale, `Lihat semua (${repos.length})`, `See all (${repos.length})`)}
        </button>
      ) : null}
    </section>
  );
}

/** How many rows the board shows here; the whole of it is on /leaderboard. */
const BOARD_SHOWN = 5;

/**
 * The left column: who keeps at it (see `seasonBoard`), the top few with the
 * whole board a link away on /leaderboard. A name opens their profile; the
 * funnel beside it narrows the feed to them. A signed-in member outside the shown rows still
 * sees their own.
 */
function Leaderboard({
  rows: all,
  choice,
  boardWeeks,
  current,
  viewerHandle,
  locale,
}: {
  rows: ConsistencyRow[];
  choice: LeaderboardChoice;
  /** The weeks the board counts: the season's, or the last four or eight. */
  boardWeeks: BoardWindow;
  current: ActivityFilters;
  viewerHandle: string | null;
  locale: Locale;
}) {
  const rows = all.slice(0, BOARD_SHOWN);
  const viewerKey = viewerHandle?.toLowerCase() ?? "";
  const viewerRank = viewerKey ? all.findIndex(({ person }) => person.handle.toLowerCase() === viewerKey) : -1;
  const score = ({ filled }: ConsistencyRow) => `${filled}/${boardWeeks.current + 1}`;
  const where = choice.of === "own" ? tx(locale, "repo sendiri", "own repos") : tx(locale, "repo orang lain", "other people's repos");

  return (
    <aside className="ax-board tone-done" aria-labelledby="board-title">
      <div className="ax-board-head">
        <h2 id="board-title">
          <span aria-hidden="true">🏆</span> Board of contribution
          <BoardInfo weeks={boardWeeks} span={current.weeks} of={choice.of} count={choice.count} locale={locale} />
        </h2>
      </div>

      {rows.length === 0 ? (
        <p className="ax-board-empty">
          {tx(
            locale,
            `Belum ada PR ke ${where} ${current.weeks === "season" ? "musim ini" : `dalam ${current.weeks} minggu terakhir`}. Satu PR minggu ini sudah cukup untuk mulai!`,
            `No PRs to ${where} ${current.weeks === "season" ? "this season" : `in the last ${current.weeks} weeks`} yet. One PR this week is enough to start!`,
          )}
        </p>
      ) : (
        <ol className={`ax-board-list is-${choice.count}`}>
          {rows.map((row, index) => {
            const { person, weeks, prs, streak } = row;
            const on = person.handle.toLowerCase() === current.member.toLowerCase();
            const mine = person.handle.toLowerCase() === viewerKey;
            return (
              <li key={person.id} className={`${on ? "is-active" : ""} ${mine ? "is-mine" : ""}`}>
                <Link className="ax-board-person" href={`/u/${encodeURIComponent(person.username)}`}>
                  <span className="ax-board-rank" aria-label={tx(locale, `Peringkat ${index + 1}`, `Rank ${index + 1}`)}>
                    <Rank place={index + 1} />
                  </span>
                  <Avatar handle={person.handle} size={24} />
                  <span className="ax-board-who">
                    <span className="ax-board-name">{person.name || `@${person.handle}`}</span>
                    <span className="ax-board-meta">
                      <WeekDots weeks={weeks} current={boardWeeks.current} slim locale={locale} />
                      <span>{tx(locale, `${prs} PR`, `${prs} ${prs === 1 ? "PR" : "PRs"}`)}</span>
                      {streak > 0 ? <span aria-label={tx(locale, `streak ${streak} minggu`, `${streak}-week streak`)}>🔥 {streak}</span> : null}
                    </span>
                  </span>
                  <span className="ax-board-score">
                    <strong>{score(row)}</strong>
                  </span>
                </Link>
                <InstantLink
                  className="ax-board-filter"
                  href={activityPath({ ...current, member: on ? "" : person.handle })}
                  aria-current={on ? "true" : undefined}
                  aria-label={on ? tx(locale, "Tampilkan semua orang", "Show everyone") : tx(locale, `Feed ${person.name || person.handle} saja`, `Only ${person.name || person.handle} in the feed`)}
                  title={on ? tx(locale, "Tampilkan semua orang", "Show everyone") : tx(locale, "Feed orang ini saja", "Only them in the feed")}
                >
                  <FilterIcon />
                </InstantLink>
              </li>
            );
          })}
        </ol>
      )}

      <ThisWeek
        className="ax-board-week"
        moreHref={leaderboardPath(choice)}
        names={all.filter(({ weeks }) => weeks[boardWeeks.current]).map(({ person }) => person.name || `@${person.handle}`)}
        locale={locale}
      />

      {viewerRank >= BOARD_SHOWN ? (
        <p className={`ax-board-you is-${choice.count}`}>
          <Link href={`/u/${encodeURIComponent(all[viewerRank].person.username)}#season-heading`}>
            {tx(locale, "Kamu", "You")} <strong>#{viewerRank + 1}</strong>
          </Link>
          <WeekDots weeks={all[viewerRank].weeks} current={boardWeeks.current} slim locale={locale} />
          <span>{score(all[viewerRank])}</span>
          {all[viewerRank].streak > 0 ? <span>🔥 {all[viewerRank].streak}</span> : null}
        </p>
      ) : viewerKey && viewerRank < 0 ? (
        <p className="ax-board-you">
          {choice.of === "external"
            ? tx(locale, "Kamu belum punya PR ke repo orang lain di minggu-minggu ini. PR ke repo sendiri ada di pilihan “repo sendiri”.", "You have no PRs to other people's repos in these weeks. PRs to your own repos are under “own repos”.")
            : tx(locale, "Kamu belum punya PR ke repo sendiri di minggu-minggu ini.", "You have no PRs to your own repos in these weeks.")}
        </p>
      ) : null}

      <p className="ax-board-foot">
        {/* A plain Link: it leaves this page, where InstantLink only swaps
            the feed's filters in place. */}
        <Link href={leaderboardPath(choice)}>
          {tx(locale, `Leaderboard lengkap (${all.length})`, `Full leaderboard (${all.length})`)} <span aria-hidden="true">→</span>
        </Link>
      </p>
    </aside>
  );
}

/** The page's choices, above both columns since they set both. A GET form, so it works before the script does. */
function ActivityControls({
  choice,
  current,
  locale,
  navigate,
}: {
  choice: LeaderboardChoice;
  current: ActivityFilters;
  locale: Locale;
  navigate: (href: string) => void;
}) {
  const spanLabels: Record<BoardSpan, string> = {
    season: tx(locale, "musim ini", "this season"),
    "4": tx(locale, "4 minggu terakhir", "last 4 weeks"),
    "8": tx(locale, "8 minggu terakhir", "last 8 weeks"),
  };
  const countLabels: Record<BoardCount, string> = {
    opened: tx(locale, "semua PR yang dibuka", "every PR opened"),
    merged: tx(locale, "PR merged saja", "merged PRs only"),
  };

  return (
    <form className="ax-controls" action="/">
      {current.member ? <input type="hidden" name="member" value={current.member} /> : null}
      {current.repo ? <input type="hidden" name="repo" value={current.repo} /> : null}
      {current.q ? <input type="hidden" name="q" value={current.q} /> : null}
      <span className="ax-controls-label">{tx(locale, "Menampilkan", "Showing")}</span>
      <label>
        <span className="sr-only">{tx(locale, "Repo siapa", "Whose repos")}</span>
        <select
          name="scope"
          className={`lb-filter ${choice.of !== "external" ? "is-set" : ""}`}
          value={choice.of}
          onChange={(event) =>
            navigate(activityPath({ ...current, scope: event.target.value === "own" ? "own" : "external", member: "", repo: "" }))
          }
        >
          <option value="external">{tx(locale, "kontribusi", "contributions")}</option>
          <option value="own">{tx(locale, "repo sendiri", "own repos")}</option>
        </select>
      </label>
      <label>
        <span className="sr-only">{tx(locale, "Rentang minggu", "Weeks")}</span>
        <select
          name="weeks"
          className={`lb-filter ${current.weeks !== "season" ? "is-set" : ""}`}
          value={current.weeks}
          onChange={(event) => {
            const weeks = event.target.value;
            navigate(activityPath({ ...current, weeks: isBoardSpan(weeks) ? weeks : "season" }));
          }}
        >
          {BOARD_SPANS.map((span) => (
            <option key={span} value={span}>
              {spanLabels[span]}
            </option>
          ))}
        </select>
      </label>
      {choice.of === "own" ? null : (
        <label>
          <span className="sr-only">{tx(locale, "PR yang dihitung", "Which PRs")}</span>
          <select
            name="count"
            className={`lb-filter ${choice.count !== "opened" ? "is-set" : ""}`}
            value={choice.count}
            onChange={(event) => {
              const count = event.target.value;
              navigate(activityPath({ ...current, count: isBoardCount(count) ? count : "opened" }));
            }}
          >
            {BOARD_COUNTS.map((count) => (
              <option key={count} value={count}>
                {countLabels[count]}
              </option>
            ))}
          </select>
        </label>
      )}
      <noscript>
        <button type="submit">{tx(locale, "Terapkan", "Apply")}</button>
      </noscript>
    </form>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2 3h12l-4.5 5.5V13l-3-1.5v-3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function PullRequestIcon({ merged }: { merged: boolean }) {
  return (
    <svg className={`ax-pr-icon ${merged ? "is-merged" : "is-open"}`} viewBox="0 0 16 16" aria-hidden="true">
      {merged ? (
        <path d="M4.25 2.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM4.25 11a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM11.75 11a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM4.25 5v6M4.25 5c0 3 3 4 7.5 4v2" />
      ) : (
        <path d="M4.25 2.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM4.25 11a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM11.75 11a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM4.25 5v6M11.75 11V6.5a2 2 0 0 0-2-2H7.5M9 3 7.5 4.5 9 6" />
      )}
    </svg>
  );
}

function Avatar({ handle, size }: { handle: string; size: number }) {
  // GitHub serves a small avatar at this address for any username, the same
  // way the directory's badges show faces.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="ax-avatar" src={`https://github.com/${encodeURIComponent(handle)}.png?size=${size * 2}`} alt="" width={size} height={size} loading="lazy" />;
}

const clockFormat = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });

/** "14.05" in Jakarta: the same on the server and in any browser. */
function clock(at: string): string {
  return clockFormat.format(new Date(at));
}

/**
 * The timeline's sections. A pull request sits under the day it happened; a
 * commit summary covers the last SUMMARY_DAYS, so the summaries share one
 * section under that name instead of the day of their latest commit — under
 * "Today" they read as if all of it happened today.
 */
function timelineGroups(entries: GitHubActivityEntry[], today: string, locale: Locale) {
  const summaries = entries.filter((entry) => entry.kind === "commit_summary");
  const days = groupByDay(entries.filter((entry) => entry.kind !== "commit_summary")).map(({ day, entries: onDay }) => ({
    day,
    title: dayLabel(day, today, locale),
    entries: onDay,
  }));
  return summaries.length > 0
    ? [{ day: "summaries", title: tx(locale, `${SUMMARY_DAYS} hari terakhir`, `Last ${SUMMARY_DAYS} days`), entries: summaries }, ...days]
    : days;
}

/** "Hari ini", "Kemarin", or the date, for a day key from groupByDay. */
function dayLabel(day: string, today: string, locale: Locale): string {
  if (day === today) return tx(locale, "Hari ini", "Today");
  if (day === dayKey(new Date(Date.parse(`${today}T12:00:00+07:00`) - 86_400_000), "Asia/Jakarta")) return tx(locale, "Kemarin", "Yesterday");
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(
    new Date(`${day}T12:00:00+07:00`),
  );
}

function Who({ entry }: { entry: GitHubActivityEntry }) {
  return (
    <Link className="ax-who" href={`/u/${entry.person.username}`}>
      {entry.person.name || `@${entry.person.handle}`}
    </Link>
  );
}

/** A repo the directory lists opens its page here; any other, GitHub. */
function RepoLink({ repo, listed }: { repo: string; listed: boolean }) {
  const content = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- the repository owner's GitHub picture */}
      <img src={ownerAvatar(repo, 32)} alt="" width={14} height={14} loading="lazy" />
      {repo}
    </>
  );
  return listed ? (
    <Link className="ax-repo" href={repoPagePath(repo)}>{content}</Link>
  ) : (
    <a className="ax-repo" href={`https://github.com/${repo}`} target="_blank" rel="noopener noreferrer">{content}</a>
  );
}

/**
 * "Zikrul got a pull request merged in owner/repo", then the PR itself; or
 * "got 4 pull requests merged", with the first few and the rest folded away.
 */
function PullRequestEvent({
  entry,
  listed,
  locale,
  reactions,
  viewerName,
}: {
  entry: PullRequestEntry;
  /** The directory lists the repo, so it has a page here. */
  listed: boolean;
  locale: Locale;
  reactions: ReactionCount[];
  viewerName: string | null;
}) {
  const merged = entry.state === "merged";
  const count = entry.pullRequests.length;
  const shown = entry.pullRequests.slice(0, count > PRS_SHOWN ? PRS_SHOWN - 1 : PRS_SHOWN);
  const folded = entry.pullRequests.slice(shown.length);
  const what =
    count === 1
      ? merged
        ? tx(locale, "PR-nya di-merge di", "got a pull request merged in")
        : tx(locale, "membuka pull request di", "opened a pull request in")
      : merged
        ? tx(locale, `${count} PR-nya di-merge di`, `got ${count} pull requests merged in`)
        : tx(locale, `membuka ${count} pull request di`, `opened ${count} pull requests in`);
  const item = (pr: PullRequestItem) => (
    <li key={pr.url}>
      <a className="ax-pr" href={pr.url} target="_blank" rel="noopener noreferrer">
        <PullRequestIcon merged={merged} />
        <span className="ax-pr-title">{pr.title || `#${pr.number}`}</span>
        <span className="ax-number">#{pr.number}</span>
      </a>
    </li>
  );
  return (
    <div className="ax-event-body">
      <p className="ax-event-line">
        <Who entry={entry} /> {what} <RepoLink repo={entry.repo} listed={listed} />
        {/* The day is the group's heading; the time is enough here. */}
        <time className="ax-time" dateTime={entry.at}>
          {clock(entry.at)}
        </time>
      </p>
      <ul className="ax-prs">{shown.map(item)}</ul>
      {folded.length > 0 ? (
        <details className="ax-prs-more">
          <summary>{tx(locale, `${folded.length} PR lainnya`, `${folded.length} more`)}</summary>
          <ul className="ax-prs">{folded.map(item)}</ul>
        </details>
      ) : null}
      <ReactionBar url={entry.url} initial={reactions} viewerName={viewerName} />
    </div>
  );
}

/** Work on one's own repositories — commits and merged PRs — one event per person. */
function CommitSummaryEvent({
  entry,
  today,
  locale,
  reactions,
  viewerName,
}: {
  entry: CommitSummaryEntry;
  today: string;
  locale: Locale;
  reactions: ReactionCount[];
  viewerName: string | null;
}) {
  const named = entry.repos.slice(0, SUMMARY_REPOS);
  const more = entry.repos.length - named.length;
  return (
    <div className="ax-event-body">
      <p className="ax-event-line">
        <Who entry={entry} />{" "}
        {ownWork(entry, locale)}
        {/* The section already says how far back it goes; here, how recent the latest of it is. */}
        <time className="ax-time" dateTime={entry.at}>
          {tx(locale, "terakhir", "latest")} {latestLabel(entry.at, today, locale)}
        </time>
      </p>
      <ul className="ax-repos">
        {named.map((repo) => (
          <li key={repo.repo}>
            <a href={`https://github.com/${repo.repo}`} target="_blank" rel="noopener noreferrer">
              {repoName(repo.repo)}
            </a>
            {repo.commits > 0 ? <span>{repo.commits}</span> : null}
          </li>
        ))}
        {more > 0 ? <li className="ax-repos-more">+{more}</li> : null}
      </ul>
      <ReactionBar url={entry.key} initial={reactions} viewerName={viewerName} />
    </div>
  );
}

/**
 * "hari ini", "kemarin", or the date: the day of a summary's latest commit or
 * merge. No clock: GitHub dates a commit contribution by its day alone, so a
 * time would be made up.
 */
function latestLabel(at: string, today: string, locale: Locale): string {
  const day = dayKey(at, "Asia/Jakarta");
  const label = dayLabel(day, today, locale);
  const recent = day === today || label === tx(locale, "Kemarin", "Yesterday");
  return recent ? label.toLowerCase() : label;
}

/** "made 205 commits and merged 40 pull requests in 7 of their own repos", leaving out what is zero. */
function ownWork(entry: CommitSummaryEntry, locale: Locale): string {
  const repos = entry.repos.length;
  const id = [entry.commits > 0 ? `membuat ${entry.commits} commit` : "", entry.merged > 0 ? `merge ${entry.merged} PR` : ""].filter(Boolean);
  const en = [
    entry.commits > 0 ? `made ${entry.commits} ${entry.commits === 1 ? "commit" : "commits"}` : "",
    entry.merged > 0 ? `merged ${entry.merged} ${entry.merged === 1 ? "pull request" : "pull requests"}` : "",
  ].filter(Boolean);
  return tx(
    locale,
    `${id.join(" dan ")} di ${repos} repo miliknya`,
    `${en.join(" and ")} in ${repos} of their own ${repos === 1 ? "repo" : "repos"}`,
  );
}
