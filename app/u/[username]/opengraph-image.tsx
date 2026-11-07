import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getPerson, getPersonStats, getPortfolio, type Person } from "../../lib/data";
import { monthYear } from "../../components/pieces";
import { MILESTONE_NAMES } from "../../components/week-dots";
import { OG, OgBrand, OgFooter, OgPill, OgWeeks, ogAvatar } from "../../components/og-parts";
import { MILESTONES, milestoneWeeks, seasonLabel } from "../../lib/github-activity";
import { githubHandle } from "../../lib/oss";
import { seasonStanding, type SeasonStanding } from "../../lib/season-standing";
import { currentLocale } from "../../lib/locale-server";
import { tx, type Locale } from "../../lib/locale";
import { isOss, site } from "../../lib/site";

/**
 * The share card for a profile — the page doing the actual promoting when a
 * portfolio link lands in a chat or a feed. Name, headline, and the numbers
 * the trail can back up. On the open source site, the member's season on the
 * leaderboard: their place, weeks, streak and milestones.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = site.name;

const PAPER = "#f8f6f0";
const INK = "#183d34";
const MUTED = "#68746d";
const ORANGE = "#ed714b";

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const [{ username }, locale] = await Promise.all([params, currentLocale()]);
  const person = await getPerson(username);

  if (!person) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: PAPER,
            color: INK,
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          {site.name}
        </div>
      ),
      size,
    );
  }

  const handle = githubHandle(person.github);
  if (isOss && handle && person.githubActivityShown) {
    await connection();
    const standing = await seasonStanding(person.id);
    if (standing) return new ImageResponse(<SeasonCard person={person} handle={handle} standing={standing} locale={locale} />, size);
  }

  const [{ owned, contributing }, stats] = await Promise.all([
    getPortfolio(person),
    getPersonStats(person.id),
  ]);
  const live = owned.filter((project) => project.stage === "live").length;

  const numbers = [
    tx(locale, `${owned.length} proyek`, `${owned.length} project`),
    live > 0 ? tx(locale, `${live} aktif`, `${live} live`) : "",
    contributing.length > 0 ? tx(locale, `${contributing.length} kontribusi`, `${contributing.length} contributions`) : "",
    stats.rolesTaken > 0 ? tx(locale, `${stats.rolesTaken} peran diikuti`, `${stats.rolesTaken} roles joined`) : "",
    stats.tasksDone > 0 ? tx(locale, `${stats.tasksDone} tugas selesai`, `${stats.tasksDone} tasks completed`) : "",
  ]
    .filter(Boolean)
    .join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          color: INK,
          padding: "64px 72px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 26,
            letterSpacing: 6,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex" }}>BUILDERS</div>
          <div style={{ display: "flex" }}>{tx(locale, "PORTOFOLIO", "PORTFOLIO")}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
            {person.name}
          </div>
          {person.headline ? (
            <div style={{ display: "flex", fontSize: 36, color: MUTED, lineHeight: 1.3 }}>
              {person.headline}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            borderTop: `3px solid ${ORANGE}`,
            paddingTop: 28,
          }}
        >
          {numbers ? <div style={{ display: "flex", fontSize: 32 }}>{numbers}</div> : null}
          <div style={{ display: "flex", fontSize: 24, color: MUTED }}>
            {stats.since
              ? tx(locale, `Aktif sejak ${monthYear(stats.since, locale)} — sistem mencatat jejak ini; bukan diketik belakangan.`, `Active since ${monthYear(stats.since, locale)} — the system records this trail; it is not typed in later.`)
              : tx(locale, "Sistem mencatat jejak ini; bukan diketik belakangan.", "The system records this trail; it is not typed in later.")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}

/** The open source site's card: who, then their season as /leaderboard counts it. */
function SeasonCard({ person, handle, standing, locale }: { person: Person; handle: string; standing: SeasonStanding; locale: Locale }) {
  const { season, contributions, members, own } = standing;
  const row = contributions?.row;
  const weeks = row?.weeks ?? season.weeks.map(() => false);
  const filled = row?.filled ?? 0;
  const soFar = season.current + 1;
  const earned = MILESTONES.filter((milestone) => filled >= milestoneWeeks(milestone, season));
  const headline = person.headline.length > 96 ? `${person.headline.slice(0, 95).trimEnd()}…` : person.headline;

  const tiles: Array<{ value: string; label: string; tone?: string }> = contributions
    ? [
        { value: `#${contributions.rank}`, label: tx(locale, `dari ${members} member`, `of ${members} members`), tone: OG.purple },
        { value: `${filled}/${soFar}`, label: tx(locale, "minggu terisi", "weeks filled") },
        { value: row && row.streak > 0 ? `🔥 ${row.streak}` : "—", label: "streak" },
        { value: String(row?.prs ?? 0), label: tx(locale, "PR musim ini", "PRs this season") },
      ]
    : own
      ? [
          { value: `${own.row.filled}/${soFar}`, label: tx(locale, "minggu di repo sendiri", "weeks on own repos"), tone: OG.green },
          { value: String(own.row.prs), label: tx(locale, "PR ke repo sendiri", "PRs to own repos") },
          { value: own.row.streak > 0 ? `🔥 ${own.row.streak}` : "—", label: "streak" },
        ]
      : [];

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${OG.paper} 55%, #f5f0ff 100%)`,
        color: OG.ink,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "44px 64px",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
        <OgBrand />
        <OgPill text={tx(locale, `Musim ${seasonLabel(season, "id")}`, `Season ${seasonLabel(season, "en")}`)} />
      </div>

      <div style={{ alignItems: "center", display: "flex", gap: 32 }}>
        <img src={ogAvatar(handle, 140)} width={140} height={140} style={{ border: `4px solid ${OG.paper}`, borderRadius: 70, boxShadow: "0 4px 18px rgba(31, 35, 40, .15)" }} alt="" />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", fontSize: 56, fontWeight: 800, letterSpacing: "-2px", lineHeight: 1.05 }}>{person.name.slice(0, 32)}</div>
          <div style={{ color: OG.muted, display: "flex", fontSize: 26 }}>
            {person.profession ? `@${handle} · ${person.profession}` : `@${handle}`}
          </div>
          {headline ? <div style={{ color: OG.ink, display: "flex", fontSize: 24, lineHeight: 1.35, marginTop: 4 }}>{headline}</div> : null}
        </div>
      </div>

      <div style={{ background: OG.paper, border: `1px solid ${OG.line}`, borderRadius: 18, display: "flex", flexDirection: "column", gap: 18, padding: "22px 28px" }}>
        {tiles.length > 0 ? (
          <div style={{ display: "flex", gap: 44 }}>
            {tiles.map((tile) => (
              <div key={tile.label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ color: tile.tone ?? OG.ink, display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: "-1px" }}>{tile.value}</div>
                <div style={{ color: OG.muted, display: "flex", fontSize: 19 }}>{tile.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
            {tx(locale, "Siap mengisi minggu pertamanya musim ini.", "Ready to fill a first week this season.")}
          </div>
        )}
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <OgWeeks weeks={contributions || !own ? weeks : own.row.weeks} current={season.current} width={30} height={16} gap={6} />
          <div style={{ display: "flex", fontSize: 22, gap: 14 }}>
            {earned.length > 0
              ? earned.map((milestone) => {
                  const [nameId, nameEn] = MILESTONE_NAMES[milestone.icon];
                  return (
                    <div key={milestone.icon} style={{ background: "#dafbe1", borderRadius: 99, color: OG.green, display: "flex", fontWeight: 700, padding: "4px 14px" }}>
                      {`${milestone.icon} ${tx(locale, nameId, nameEn)}`}
                    </div>
                  );
                })
              : null}
          </div>
        </div>
      </div>

      <OgFooter left={tx(locale, "1 minggu 1 PR", "One PR a week")} />
    </div>
  );
}
