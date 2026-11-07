import { isOss, site } from "../lib/site";

/**
 * Pieces of the leaderboard's share cards — the board's and a profile's —
 * drawn by next/og, where every box needs `display: flex`. The leaderboard's
 * colours: purple for the season, green for a week filled.
 */
export const OG = {
  paper: "#ffffff",
  ink: "#1f2328",
  muted: "#59636e",
  line: "#d1d9e0",
  soft: "#f6f8fa",
  purple: "#8250df",
  green: "#1a7f37",
} as const;

export const OG_SIZE = { width: 1200, height: 630 };

/** The GitHub picture straight from its CDN: no redirect for the renderer to follow. */
export function ogAvatar(handle: string, size: number): string {
  return `https://avatars.githubusercontent.com/${encodeURIComponent(handle)}?s=${size * 2}`;
}

/** The site's mark and name, as on the home page's card. */
export function OgBrand() {
  return (
    <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
      <div style={{ alignItems: "center", background: "#173d32", borderRadius: 12, display: "flex", height: 48, justifyContent: "center", width: 48 }}>
        {isOss ? (
          <svg width="32" height="32" viewBox="-1 -1 26 26" fill="none">
            <g stroke="#f3f0e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="2.5" />
              <circle cx="6" cy="18" r="2.5" />
              <circle cx="18" cy="18" r="2.5" />
              <path d="M6 8.5v7M18 15.5V10a3 3 0 0 0-3-3h-4M13 4.5 10.5 7 13 9.5" />
            </g>
          </svg>
        ) : (
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <path
              d="M6.8 32C7.6 28 8 24.6 9.4 21.2 11 17 17.2 14.6 20 7.6 22.8 14.6 29 17 30.6 21.2 32 24.6 32.4 28 33.2 32"
              stroke="#f3f0e8"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div style={{ color: OG.ink, display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: "-1px" }}>
        {`${site.id}.swegrowth`}
      </div>
    </div>
  );
}

/** A pill in the season's purple. */
export function OgPill({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "#f5f0ff",
        border: `1px solid #d8c7fb`,
        borderRadius: 99,
        color: OG.purple,
        display: "flex",
        fontSize: 20,
        fontWeight: 700,
        padding: "8px 18px",
      }}
    >
      {text}
    </div>
  );
}

/** The season's weeks as blocks, like the board's bars: filled green, this week ringed, the weeks to come faint. */
export function OgWeeks({ weeks, current, width, height, gap = 4 }: { weeks: boolean[]; current: number; width: number; height: number; gap?: number }) {
  return (
    <div style={{ display: "flex", gap }}>
      {weeks.map((on, index) => (
        <div
          key={index}
          style={{
            background: on ? OG.green : OG.line,
            border: index === current ? `2px solid ${on ? "#0f5323" : OG.purple}` : "2px solid transparent",
            borderRadius: 3,
            display: "flex",
            height,
            opacity: index > current ? 0.4 : 1,
            width,
          }}
        />
      ))}
    </div>
  );
}

export function OgFooter({ left }: { left: string }) {
  return (
    <div style={{ color: OG.muted, display: "flex", fontSize: 20, justifyContent: "space-between" }}>
      <div style={{ display: "flex" }}>{left}</div>
      <div style={{ display: "flex" }}>{site.url.replace(/^https?:\/\//, "")}</div>
    </div>
  );
}
