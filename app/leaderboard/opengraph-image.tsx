import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { OG, OG_SIZE, OgBrand, OgFooter, OgPill, OgWeeks, ogAvatar } from "../components/og-parts";
import { listGitHubActivity } from "../lib/data";
import { dayKey, seasonBoard, seasonLabel, seasonOf, type GitHubActivityEntry } from "../lib/github-activity";
import { currentLocale } from "../lib/locale-server";
import { tx } from "../lib/locale";
import { readPublicly } from "../lib/public-read";
import { site } from "../lib/site";

/**
 * The share card for /leaderboard: this season's board as it stands — the
 * top five, their weeks and streaks — so a link in a chat already shows who
 * is keeping at it.
 */
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = `Leaderboard — ${site.name}`;

const SHOWN = 5;
const MEDALS = ["🥇", "🥈", "🥉"];

export default async function Image() {
  await connection();
  const [locale, activity] = await Promise.all([
    currentLocale(),
    readPublicly<GitHubActivityEntry[]>("github activity for the leaderboard card", listGitHubActivity, []),
  ]);
  const today = dayKey(new Date(), "Asia/Jakarta");
  const season = seasonOf(today);
  const board = seasonBoard(activity.value, today);
  const rows = board.slice(0, SHOWN);
  const soFar = season.current + 1;

  return new ImageResponse(
    (
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
          <OgPill
            text={tx(
              locale,
              `Musim ${seasonLabel(season, "id")} · minggu ${soFar}/${season.weeks.length}`,
              `Season ${seasonLabel(season, "en")} · week ${soFar}/${season.weeks.length}`,
            )}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", fontSize: 60, fontWeight: 800, letterSpacing: "-2.5px", lineHeight: 1.05 }}>🏆 Leaderboard</div>
          <div style={{ color: OG.muted, display: "flex", fontSize: 26 }}>
            {tx(locale, "1 minggu 1 PR. Yang dihitung rutinnya, bukan banyaknya.", "One PR a week. It counts keeping at it, not volume.")}
          </div>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              background: OG.soft,
              border: `1px solid ${OG.line}`,
              borderRadius: 16,
              color: OG.ink,
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              padding: "40px 36px",
            }}
          >
            {tx(locale, "Musim baru dimulai. Satu PR minggu ini sudah cukup untuk jadi yang pertama!", "A new season has begun. One PR this week is enough to be the first!")}
          </div>
        ) : (
          <div style={{ border: `1px solid ${OG.line}`, borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {rows.map(({ person, weeks, filled, streak }, index) => (
              <div
                key={person.id}
                style={{
                  alignItems: "center",
                  background: index % 2 === 0 ? OG.paper : OG.soft,
                  borderTop: index === 0 ? "none" : `1px solid ${OG.line}`,
                  display: "flex",
                  gap: 20,
                  height: 58,
                  padding: "0 24px",
                }}
              >
                <div style={{ display: "flex", fontSize: 28, fontWeight: 800, justifyContent: "center", width: 40 }}>{MEDALS[index] ?? String(index + 1)}</div>
                <img src={ogAvatar(person.handle, 40)} width={40} height={40} style={{ borderRadius: 20 }} alt="" />
                <div style={{ display: "flex", flex: 1, fontSize: 26, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap" }}>
                  {(person.name || `@${person.handle}`).slice(0, 26)}
                </div>
                <OgWeeks weeks={weeks} current={season.current} width={18} height={18} />
                <div style={{ color: OG.purple, display: "flex", fontSize: 26, fontWeight: 800, justifyContent: "flex-end", width: 70 }}>{`${filled}/${soFar}`}</div>
                <div style={{ display: "flex", fontSize: 24, fontWeight: 700, justifyContent: "flex-end", width: 80 }}>{streak > 0 ? `🔥 ${streak}` : "—"}</div>
              </div>
            ))}
          </div>
        )}

        <OgFooter
          left={
            board.length > SHOWN
              ? tx(locale, `+${board.length - SHOWN} member lain di papan musim ini`, `+${board.length - SHOWN} more on this season's board`)
              : tx(locale, `${board.length} member di papan musim ini`, `${board.length} on this season's board`)
          }
        />
      </div>
    ),
    size,
  );
}
