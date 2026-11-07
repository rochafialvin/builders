import { connection } from "next/server";
import Link from "@/app/components/responsive-link";
import { BoardInfo, MILESTONE_NAMES, WeekDots } from "./week-dots";
import { MILESTONES, milestoneWeeks, nextMilestone, seasonLabel } from "../lib/github-activity";
import { seasonStanding } from "../lib/season-standing";
import { tx, type Locale } from "../lib/locale";

/**
 * A member's season on their profile, as /leaderboard counts it. Read per
 * request, since it depends on today; the profile around it stays prerendered.
 */
export async function SeasonRecord({ personId, self, locale }: { personId: string; self: boolean; locale: Locale }) {
  await connection();
  const standing = await seasonStanding(personId);
  if (!standing) return null;

  const { season, contributions, members, own } = standing;
  // Nothing on either board: only the member sees the empty season.
  if (!contributions && !own && !self) return null;

  const row = contributions?.row;
  const weeks = row?.weeks ?? season.weeks.map(() => false);
  const filled = row?.filled ?? 0;
  const streak = row?.streak ?? 0;
  const thisWeek = weeks[season.current];
  const next = nextMilestone(filled, thisWeek, season);
  const [nextId, nextEn] = next ? MILESTONE_NAMES[next.milestone.icon] : ["", ""];

  return (
    <section className={`pf-section pf-season lb-you ${thisWeek ? "is-done" : ""}`} aria-labelledby="season-heading">
      <div className="pf-section-head">
        <h2 id="season-heading">
          <span aria-hidden="true">🏆</span> Board of contribution <BoardInfo weeks={season} span="season" locale={locale} />
        </h2>
        <Link href="/leaderboard">Leaderboard →</Link>
      </div>

      <p className="pf-season-rank">
        {contributions ? (
          <>
            <strong>#{contributions.rank}</strong> {tx(locale, `dari ${members} member di papan musim ini`, `of ${members} on this season's board`)}
          </>
        ) : (
          tx(locale, "Belum ada di papan kontribusi musim ini", "Not on this season's contributions board yet")
        )}
        <span>
          {tx(
            locale,
            `Musim ${seasonLabel(season, "id")} · minggu ke-${season.current + 1} dari ${season.weeks.length}`,
            `Season ${seasonLabel(season, "en")} · week ${season.current + 1} of ${season.weeks.length}`,
          )}
        </span>
      </p>

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
          <dt>{tx(locale, "PR musim ini", "PRs this season")}</dt>
          <dd>{row?.prs ?? 0}</dd>
        </div>
        <div>
          <dt>Repo</dt>
          <dd>{row?.repos ?? 0}</dd>
        </div>
      </dl>

      <ul className="pf-badges" aria-label={tx(locale, "Milestone musim ini", "This season's milestones")}>
        {MILESTONES.map((milestone) => {
          const needed = milestoneWeeks(milestone, season);
          const [nameId, nameEn] = MILESTONE_NAMES[milestone.icon];
          return (
            <li key={milestone.icon} className={filled >= needed ? "is-earned" : undefined}>
              <span aria-hidden="true">{milestone.icon}</span> {tx(locale, nameId, nameEn)}{" "}
              <small>{filled >= needed ? "✓" : `${filled}/${needed}`}</small>
            </li>
          );
        })}
      </ul>

      {own ? (
        <p className="pf-season-own">
          <span>
            {tx(
              locale,
              `Repo sendiri: ${own.row.filled} minggu terisi · ${own.row.prs} PR`,
              `Own repos: ${own.row.filled} ${own.row.filled === 1 ? "week" : "weeks"} filled · ${own.row.prs} ${own.row.prs === 1 ? "PR" : "PRs"}`,
            )}
          </span>
          <WeekDots weeks={own.row.weeks} current={season.current} slim locale={locale} />
        </p>
      ) : null}

      {self ? (
        <p className="pf-season-next">
          {thisWeek
            ? tx(locale, "Minggu ini sudah terisi.", "This week is done.")
            : tx(locale, "1 PR minggu ini mengisi minggumu.", "One PR this week fills it.")}{" "}
          {next
            ? tx(
                locale,
                `${next.needed} minggu lagi ke ${next.milestone.icon} ${nextId}.`,
                `${next.needed} more ${next.needed === 1 ? "week" : "weeks"} to ${next.milestone.icon} ${nextEn}.`,
              )
            : null}{" "}
          {thisWeek ? null : <Link href="/directory">{tx(locale, "Cari repo", "Find a repo")} →</Link>}
        </p>
      ) : null}
    </section>
  );
}
