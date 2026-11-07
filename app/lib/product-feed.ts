import { dayKey } from "./github-activity";
import { tx, type Locale } from "./locale";
import { roleLabel } from "./roles";
import { isStage, stageMeta } from "./stages";

/**
 * The builders site's /activity: what members' products did, read from the
 * trail `events` already keeps — a product added, moved to a new stage, an
 * update posted, a role opened or filled. The open source site's /activity
 * is members' pull requests instead; this is its counterpart for products.
 *
 * One entry per product per day, so a busy afternoon on one product reads as
 * one card rather than five. Days are counted in WIB, as on the PR feed.
 *
 * Pure, so the unit tests read it directly.
 */

/** Keep in step with `is_feed_event_kind` in supabase/migrations/20261101000000_product_feed_reactions.sql. */
export const FEED_KINDS = ["project_created", "project_stage_changed", "update_posted", "seat_opened", "seat_filled"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export function isFeedKind(value: string): value is FeedKind {
  return (FEED_KINDS as readonly string[]).includes(value);
}

/** The half of a trail event the feed reads. */
export type FeedEvent = {
  id: number;
  kind: string;
  createdAt: string;
  projectSlug: string;
  projectTitle: string;
  payload: Record<string, string>;
  actor: { username: string; name: string } | null;
};

export type ProductDay = {
  /** The day's first event: what its reactions are keyed by, and so stable as the day goes on. */
  firstEventId: number;
  day: string;
  /** When the latest of the day's events happened. */
  at: string;
  product: { slug: string; title: string };
  /** Newest first. */
  events: FeedEvent[];
};

/**
 * The feed's entries, newest first: each product's events grouped by day.
 * A product deleted since keeps its events under the title they were
 * recorded with, and no link.
 *
 * With a feed kind, each entry shows only that kind's events and entries
 * without it drop — the filter chips' choice, made here so it stays pure.
 */
export function groupProductFeed(events: FeedEvent[], timeZone = "Asia/Jakarta", feed: "" | FeedKind = ""): ProductDay[] {
  const byKey = new Map<string, ProductDay>();
  const newestFirst = [...events].filter((event) => isFeedKind(event.kind)).sort((a, b) => b.id - a.id);

  for (const event of newestFirst) {
    const day = dayKey(event.createdAt, timeZone);
    const key = `${event.projectSlug || event.projectTitle}|${day}`;
    const entry = byKey.get(key);
    if (entry) {
      entry.events.push(event);
      entry.firstEventId = Math.min(entry.firstEventId, event.id);
    } else {
      byKey.set(key, {
        firstEventId: event.id,
        day,
        at: event.createdAt,
        product: { slug: event.projectSlug, title: event.projectTitle },
        events: [event],
      });
    }
  }

  const days = [...byKey.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (feed === "") return days;
  // A filtered entry keeps its day's key, so reactions stay where they were
  // left; its lines narrow, and its time is its newest shown line's.
  return days
    .map((day) => ({ ...day, events: day.events.filter((event) => event.kind === feed) }))
    .filter((day) => day.events.length > 0)
    .map((day) => ({ ...day, at: day.events[0].createdAt }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The timeline's days, newest first, as the PR feed groups them. */
export function feedDays(entries: ProductDay[]): { day: string; entries: ProductDay[] }[] {
  const days: { day: string; entries: ProductDay[] }[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last?.day === entry.day) last.entries.push(entry);
    else days.push({ day: entry.day, entries: [entry] });
  }
  return days;
}

/** The numbers beside the heading, over the last 30 days. */
export function feedStats(events: FeedEvent[], now: Date = new Date()): { products: number; updates: number; rolesFilled: number } {
  const since = now.getTime() - 30 * 86_400_000;
  const recent = events.filter((event) => isFeedKind(event.kind) && Date.parse(event.createdAt) >= since);
  return {
    products: new Set(recent.map((event) => event.projectSlug || event.projectTitle)).size,
    updates: recent.filter((event) => event.kind === "update_posted").length,
    rolesFilled: recent.filter((event) => event.kind === "seat_filled").length,
  };
}

/** The page asked for, clamped to the pages there are, and its slice of the entries. */
export function feedPage(entries: ProductDay[], requested: number, size = 60): { page: number; pages: number; shown: ProductDay[] } {
  const pages = Math.max(1, Math.ceil(entries.length / size));
  const page = Math.min(Math.max(1, requested), pages);
  return { page, pages, shown: entries.slice((page - 1) * size, page * size) };
}

/** The filter chips' names for the kinds, one chip per kind. */
export function feedKindLabel(kind: FeedKind, locale: Locale): string {
  switch (kind) {
    case "project_created":
      return tx(locale, "Produk baru", "New product");
    case "project_stage_changed":
      return tx(locale, "Pindah tahap", "Stage moved");
    case "update_posted":
      return tx(locale, "Kabar terbaru", "Updates");
    case "seat_opened":
      return tx(locale, "Peran dibuka", "Role opened");
    case "seat_filled":
      return tx(locale, "Peran terisi", "Role filled");
  }
}

/** "Hari ini", "Kemarin", or the date, for a day key from groupProductFeed. */
export function dayLabel(day: string, today: string, locale: Locale): string {
  if (day === today) return tx(locale, "Hari ini", "Today");
  if (day === dayKey(new Date(Date.parse(`${today}T12:00:00+07:00`) - 86_400_000), "Asia/Jakarta")) return tx(locale, "Kemarin", "Yesterday");
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(
    new Date(`${day}T12:00:00+07:00`),
  );
}

/**
 * One line of a product's card, after the actor's name. The card's heading
 * already names the product, so unlike the profile trail's activityParts
 * these leave it out: "membuka peran QA Engineer", not "… di Qala Temu".
 */
export function feedLine(event: Pick<FeedEvent, "kind" | "payload">, locale: Locale): string {
  const { payload } = event;
  const role = payload.role ? roleLabel(payload.role, "", locale) : "";
  const stage = payload.to && isStage(payload.to) ? tx(locale, stageMeta[payload.to].labelId, stageMeta[payload.to].label) : payload.to ?? "";

  switch (event.kind) {
    case "project_created":
      return tx(locale, "mendaftarkan produk ini.", "listed this product.");
    case "project_stage_changed":
      return tx(locale, `memindahkannya ke tahap ${stage}.`, `moved it to ${stage}.`);
    case "update_posted":
      return payload.update_title
        ? tx(locale, `mengirim kabar: “${payload.update_title}”`, `posted an update: “${payload.update_title}”`)
        : tx(locale, "mengirim kabar terbaru.", "posted an update.");
    case "seat_opened":
      return tx(locale, `membuka peran ${role}.`, `opened the ${role} role.`);
    case "seat_filled":
      return tx(locale, `bergabung sebagai ${role}.`, `joined as ${role}.`);
    default:
      return tx(locale, "berkontribusi.", "contributed.");
  }
}
