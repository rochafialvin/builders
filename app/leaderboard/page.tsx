import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "@/app/components/responsive-link";
import { SiteFooter, SiteHeader } from "../components/shell";
import { Skeleton } from "../components/skeleton";
import { BoardFilters } from "../components/board-filters";
import { BoardInfo, MILESTONE_NAMES, Rank, ThisWeek, WeekDots } from "../components/week-dots";
import { leaderboardIssueUrl } from "../content";
import { currentLocale } from "../lib/locale-server";
import { tx, type Locale } from "../lib/locale";
import { site } from "../lib/site";
import { listGitHubActivity, listOwnPullRequests } from "../lib/data";
import { localRepos } from "../lib/directory-read";
import { readPublicly } from "../lib/public-read";
import { currentViewer } from "../lib/session";
import { githubHandle } from "../lib/oss";
import type { LeaderboardChoice } from "../lib/activity-url";
import {
  MILESTONES,
  boardEntries,
  boardWindow,
  dayKey,
  inPlace,
  isActivityPlace,
  isBoardCount,
  isBoardOf,
  isBoardSpan,
  milestoneWeeks,
  nextMilestone,
  seasonBoard,
  seasonLabel,
  seasonOf,
  type ActivityPlace,
  type BoardCount,
  type BoardOf,
  type BoardSpan,
  type BoardWindow,
  type ConsistencyRow,
  type GitHubActivityEntry,
  type PullRequestEntry,
  type Season,
} from "../lib/github-activity";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const title = tx(locale, `Leaderboard — ${site.name}`, `Leaderboard — ${site.name}`);
  const description = tx(
    locale,
    "1 minggu 1 PR: siapa yang rutin berkontribusi ke open source musim ini, di komunitas swegrowth.",
    "One PR a week: who keeps contributing to open source this season, in the swegrowth community.",
  );
  return {
    title,
    description,
    alternates: { canonical: "/leaderboard" },
    openGraph: { title, description, url: "/leaderboard" },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The leaderboard: one PR a week, a season at a time (see `seasonBoard`).
 *
 * It is built for keeping at it rather than for winning: first how the member
 * looking is doing and what the next step is, then the milestones anybody can
 * reach, and only then the ranking.
 */
export default async function LeaderboardPage({ searchParams }: { searchParams?: SearchParams }) {
  const locale = await currentLocale();
  const query = searchParams ?? Promise.resolve({});

  return (
    <>
      <SiteHeader returnTo="/leaderboard" active="leaderboard" />

      <main id="main-content" className="ab-page lb-page">
        <Suspense fallback={<LeaderboardSkeleton locale={locale} />}>
          <LeaderboardBody query={query} locale={locale} />
        </Suspense>

        <section className="ab-section" aria-labelledby="next-title">
          <h2 id="next-title">{tx(locale, "Berikutnya", "Next")}</h2>
          <p className="lb-note">
            {tx(
              locale,
              "Arsip juara tiap musim dan badge lain lagi dibahas terbuka. Punya ide yang bikin kamu pengin kontribusi lebih sering? ",
              "A record of each season's leaders and more badges are being worked out in the open. Got an idea that would make you contribute more often? ",
            )}
            <a href={leaderboardIssueUrl} target="_blank" rel="noopener noreferrer">
              {tx(locale, "Tulis di #186", "Say it on #186")} <span aria-hidden="true">↗</span>
            </a>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/** The heading; the season line waits for the request, since it depends on today. */
function Intro({ locale, season }: { locale: Locale; season?: Season }) {
  return (
    <header className="ab-intro" aria-labelledby="leaderboard-title">
      <h1 id="leaderboard-title">
        <span aria-hidden="true">🏆</span> Leaderboard
      </h1>
      <p className="lb-season">
        {season
          ? tx(
              locale,
              `Musim ${seasonLabel(season, "id")} · minggu ke-${season.current + 1} dari ${season.weeks.length}`,
              `Season ${seasonLabel(season, "en")} · week ${season.current + 1} of ${season.weeks.length}`,
            )
          : "\u00a0"}
      </p>
      <div className="ab-story">
        <p>
          {tx(
            locale,
            "1 minggu 1 PR. Minggumu terisi kalau kamu membuka PR ke repo orang lain—masih direview atau sudah di-merge. Yang dihitung rutinnya, bukan banyaknya. Tiap kuartal musim baru dimulai, dan semua mulai lagi dari nol.",
            "One PR a week. A week counts when you open a PR to somebody else's repo—in review or merged. It counts keeping at it, not volume. A new season starts every quarter, and everybody starts again from zero.",
          )}
        </p>
      </div>
    </header>
  );
}

async function LeaderboardBody({ query, locale }: { query: SearchParams; locale: Locale }) {
  const values = await query;
  // Today in WIB is read per request, not frozen into the prerendered shell.
  await connection();
  const ask = (key: string) => {
    const value = values[key];
    return typeof value === "string" ? value : "";
  };
  const [askedWeeks, askedOf, askedCount, askedPlace] = [ask("weeks"), ask("of"), ask("count"), ask("place")];
  const span: BoardSpan = isBoardSpan(askedWeeks) ? askedWeeks : "season";
  const of: BoardOf = isBoardOf(askedOf) ? askedOf : "external";
  // Own repos are counted by every PR opened: no merged-only choice.
  const count: BoardCount = of === "external" && isBoardCount(askedCount) ? askedCount : "opened";
  const today = dayKey(new Date(), "Asia/Jakarta");
  const season = seasonOf(today);
  const boardWeeks = boardWindow(today, span);
  const [result, own, viewer, local] = await Promise.all([
    readPublicly<GitHubActivityEntry[]>("github activity for the leaderboard", listGitHubActivity, []),
    of === "own" ? readPublicly<PullRequestEntry[]>("own pull requests for the leaderboard", listOwnPullRequests, []) : { value: [], unavailable: false },
    currentViewer(),
    localRepos(locale),
  ]);
  const localSet = new Set(local);
  // Local or global only when the directory knows which repos are local.
  // Local or global only splits contributions.
  const place: ActivityPlace = local.length > 0 && of === "external" && isActivityPlace(askedPlace) ? askedPlace : "all";
  const choice: LeaderboardChoice = { of, count, weeks: span, place };
  const unavailable = result.unavailable || own.unavailable;
  // The member's card and the milestones are always the season's
  // contributions; the board follows what is asked for.
  const everywhere = seasonBoard(result.value, today);
  const rows = seasonBoard(inPlace(boardEntries(result.value, own.value, of, count), place, localSet), today, undefined, boardWeeks);

  const viewerHandle = viewer?.githubActivityShown ? githubHandle(viewer.github) : "";
  const viewerKey = viewerHandle.toLowerCase();
  const mine = viewerKey ? everywhere.find(({ person }) => person.handle.toLowerCase() === viewerKey) : undefined;

  return (
    <>
      <Intro locale={locale} season={season} />

      <YourSeason
        locale={locale}
        season={season}
        state={!viewer ? "guest" : !viewerHandle ? "hidden" : "shown"}
        row={mine}
        username={viewer?.username ?? ""}
      />

      <section className="ab-section" aria-labelledby="milestones-title">
        <h2 id="milestones-title">{tx(locale, "Milestone musim ini", "This season's milestones")}</h2>
        <p className="lb-note">
          {tx(locale, "Bisa diraih siapa pun—nggak perlu mengalahkan siapa-siapa.", "Anybody can reach them—nobody has to be beaten.")}
        </p>
        <ul className="lb-milestones">
          {MILESTONES.map((milestone) => {
            const weeks = milestoneWeeks(milestone, season);
            const reached = everywhere.filter((row) => row.filled >= weeks).length;
            const [nameId, nameEn] = MILESTONE_NAMES[milestone.icon];
            return (
              <li key={milestone.icon} className={mine && mine.filled >= weeks ? "is-mine" : undefined}>
                <span className="lb-milestone-icon" aria-hidden="true">
                  {milestone.icon}
                </span>
                <strong>{tx(locale, nameId, nameEn)}</strong>
                <span>{tx(locale, `${weeks} minggu terisi`, `${weeks} weeks filled`)}</span>
                <small>
                  {reached > 0
                    ? tx(locale, `${reached} member sudah`, `${reached} ${reached === 1 ? "member has" : "members have"}`)
                    : tx(locale, "Belum ada yang sampai", "Nobody yet")}
                </small>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ab-section" aria-labelledby="board-title">
        <div className="lb-board-head">
          <h2 id="board-title">
            {span === "season" ? tx(locale, "Papan musim ini", "This season's board") : tx(locale, `Papan ${span} minggu terakhir`, `The last ${span} weeks`)}{" "}
            <BoardInfo weeks={boardWeeks} span={span} of={of} count={count} places={local.length > 0 && of === "external"} locale={locale} />
          </h2>
          <BoardFilters choice={choice} places={local.length > 0} locale={locale} />
        </div>
        {unavailable ? null : (
          <ThisWeek
            className="lb-note lb-week"
            names={rows.filter(({ weeks }) => weeks[boardWeeks.current]).map(({ person }) => person.name || `@${person.handle}`)}
            locale={locale}
          />
        )}
        {unavailable ? (
          <p className="lb-note">{tx(locale, "Data aktivitas sedang tidak bisa dibaca. Coba lagi sebentar.", "The activity could not be read just now. Try again shortly.")}</p>
        ) : rows.length === 0 ? (
          <p className="lb-note">
            {tx(
              locale,
              `Belum ada PR ${of === "own" ? "ke repo sendiri " : ""}${span === "season" ? "musim ini" : `dalam ${span} minggu terakhir`}. Satu PR minggu ini sudah cukup untuk jadi yang pertama!`,
              `No PRs ${of === "own" ? "to their own repos " : ""}${span === "season" ? "this season" : `in the last ${span} weeks`} yet. One PR this week is enough to be the first!`,
            )}
          </p>
        ) : (
          <SeasonTable rows={rows} season={season} boardWeeks={boardWeeks} count={count} milestones={span === "season"} viewerKey={viewerKey} locale={locale} />
        )}
        <p className="lb-note">
          {tx(
            locale,
            "Urutan: minggu terisi, lalu streak, lalu jumlah repo, lalu jumlah PR. Streak berlanjut antar-musim, dan minggu ini belum memutusnya sampai Minggu berakhir (WIB).",
            "Ranked by weeks filled, then the streak, then repos, then PRs. A streak carries across seasons, and this week does not break it until Sunday is over (WIB).",
          )}
        </p>
      </section>
    </>
  );
}

/**
 * The member looking, first: their weeks, their streak, whether this week is
 * done, and the next milestone within reach — with a way to a repo when this
 * week is still empty.
 */
function YourSeason({
  locale,
  season,
  state,
  row,
  username,
}: {
  locale: Locale;
  season: Season;
  state: "guest" | "hidden" | "shown";
  row: ConsistencyRow | undefined;
  username: string;
}) {
  if (state === "guest") {
    return (
      <section className="lb-you" aria-labelledby="you-title">
        <h2 id="you-title">{tx(locale, "Progresmu", "Your progress")}</h2>
        <p>{tx(locale, "Masuk dan hubungkan GitHub-mu untuk melihat minggu-minggumu di musim ini.", "Sign in and link your GitHub to see your weeks this season.")}</p>
        <Link className="ab-button ab-button-primary" href="/signin?next=%2Fleaderboard">
          {tx(locale, "Masuk", "Sign in")}
        </Link>
      </section>
    );
  }
  if (state === "hidden") {
    return (
      <section className="lb-you" aria-labelledby="you-title">
        <h2 id="you-title">{tx(locale, "Progresmu", "Your progress")}</h2>
        <p>
          {tx(
            locale,
            "Hubungkan GitHub-mu dan tampilkan aktivitasnya supaya minggumu ikut terhitung.",
            "Link your GitHub and show its activity so your weeks count.",
          )}
        </p>
        <Link className="ab-button ab-button-primary" href="/account/profile#github-account">
          {tx(locale, "Atur di profil", "Set it up in your profile")}
        </Link>
      </section>
    );
  }

  const weeks = row?.weeks ?? season.weeks.map(() => false);
  const filled = row?.filled ?? 0;
  const streak = row?.streak ?? 0;
  const thisWeek = weeks[season.current];
  const next = nextMilestone(filled, thisWeek, season);
  const [nameId, nameEn] = next ? MILESTONE_NAMES[next.milestone.icon] : ["", ""];

  return (
    <section className={`lb-you ${thisWeek ? "is-done" : ""}`} aria-labelledby="you-title">
      <h2 id="you-title">
        {tx(locale, "Progresmu musim ini", "Your season so far")} <BoardInfo weeks={season} span="season" locale={locale} />
      </h2>
      <WeekDots weeks={weeks} current={season.current} locale={locale} />
      <dl className="lb-you-stats">
        <div>
          <dt>{tx(locale, "Minggu terisi", "Weeks filled")}</dt>
          <dd>
            {filled}/{season.current + 1}
          </dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>{streak > 0 ? `🔥 ${streak}` : "—"}</dd>
        </div>
        <div>
          <dt>{tx(locale, "Minggu ini", "This week")}</dt>
          <dd>{thisWeek ? tx(locale, "✓ Sudah", "✓ Done") : tx(locale, "Belum", "Not yet")}</dd>
        </div>
      </dl>
      <p>
        {thisWeek
          ? tx(locale, "Minggu ini sudah terisi. Sampai jumpa minggu depan!", "This week is done. See you next week!")
          : streak > 0
            ? tx(locale, `1 PR minggu ini menjaga streak 🔥 ${streak}-mu.`, `One PR this week keeps your 🔥 ${streak} streak going.`)
            : tx(locale, "1 PR minggu ini sudah cukup untuk mulai.", "One PR this week is enough to start.")}{" "}
        {next
          ? tx(
              locale,
              `${next.needed} minggu lagi ke ${next.milestone.icon} ${nameId}.`,
              `${next.needed} more ${next.needed === 1 ? "week" : "weeks"} to ${next.milestone.icon} ${nameEn}.`,
            )
          : null}
      </p>
      {thisWeek ? null : (
        <Link className="ab-button ab-button-primary" href="/directory">
          {tx(locale, "Cari repo untuk PR minggu ini", "Find a repo for this week's PR")} <span aria-hidden="true">→</span>
        </Link>
      )}
      {username ? (
        <Link href={`/u/${encodeURIComponent(username)}#season-heading`}>
          {tx(locale, "Lihat di profilmu", "See it on your profile")} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </section>
  );
}

function SeasonTable({
  rows,
  season,
  boardWeeks,
  count,
  milestones,
  viewerKey,
  locale,
}: {
  rows: ConsistencyRow[];
  season: Season;
  boardWeeks: BoardWindow;
  /** What fills a week, which colours the bars. */
  count: BoardCount;
  /** Milestones are the season's: shown only on its board. */
  milestones: boolean;
  viewerKey: string;
  locale: Locale;
}) {
  return (
    <div className="lb-table">
      <table className={`lb-board is-${count}`}>
        <thead>
          <tr>
            <th>#</th>
            <th>{tx(locale, "Member", "Member")}</th>
            <th>{tx(locale, "Minggu", "Weeks")}</th>
            <th>Streak</th>
            {milestones ? <th className="lb-wide">Milestone</th> : null}
            <th className="lb-wide">Repo</th>
            <th className="lb-wide">PR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ person, weeks, filled, streak, repos, prs }, index) => (
            <tr key={person.id} className={person.handle.toLowerCase() === viewerKey ? "is-mine" : undefined}>
              <td><Rank place={index + 1} /></td>
              <td>
                {/* eslint-disable-next-line @next/next/no-img-element -- the member's GitHub picture */}
                <img className="lb-avatar" src={`https://github.com/${encodeURIComponent(person.handle)}.png?size=56`} alt="" width={28} height={28} />
                <span className="lb-who">
                  <Link href={`/u/${encodeURIComponent(person.username)}`}>{person.name || `@${person.handle}`}</Link>
                  <WeekDots weeks={weeks} current={boardWeeks.current} slim locale={locale} />
                </span>
              </td>
              <td className="lb-points">
                {filled}/{boardWeeks.current + 1}
              </td>
              <td>{streak > 0 ? `🔥 ${streak}` : "—"}</td>
              {milestones ? (
                <td className="lb-wide">
                  {MILESTONES.filter((milestone) => filled >= milestoneWeeks(milestone, season))
                    .map((milestone) => milestone.icon)
                    .join("") || "—"}
                </td>
              ) : null}
              <td className="lb-wide">{repos}</td>
              <td className="lb-wide">{prs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardSkeleton({ locale }: { locale: Locale }) {
  return (
    <div aria-busy="true">
      <Intro locale={locale} />
      <Skeleton height={150} style={{ borderRadius: 12, marginTop: 24 }} />
      <Skeleton height={320} style={{ borderRadius: 12, marginTop: 32 }} />
    </div>
  );
}
