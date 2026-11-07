import { prTierLabel, repoPagePath, scopeLabel, scopeOf, type DirectoryEntry } from "./directory";
import type { ActivityPerson } from "./github-activity";
import type { Locale } from "./locale";

/**
 * What a repo's share card shows, worked out once for both the card
 * (directory/[owner]/[repo]/card/route.tsx) and the page's metadata, which
 * names the card by a hash of exactly this.
 *
 * The hash is the point. Chat apps keep a link preview's image by its URL,
 * and so does the CDN; a card at a fixed address went on showing 85 stars for
 * aula-id/koma after GitHub said 231. With the content in the address, a card
 * that changes is a new URL, and one that has not is still the cached one.
 */

/** Faces in the card's bottom row. */
export const CARD_FACES = 6;

export type RepoCardFields = {
  ownerName: string;
  repoName: string;
  description: string;
  language: string;
  stars: string;
  tier: string;
  scope: string;
  faces: { id: string; handle: string }[];
  merged: number;
};

export function repoCardFields(entry: DirectoryEntry, merged: ActivityPerson[], locale: Locale): RepoCardFields {
  const name = entry.links.find((link) => link.kind === "github")?.label ?? `${entry.owner}/${entry.name}`;
  const [ownerName, repoName] = name.split("/");
  return {
    ownerName,
    repoName,
    description: entry.description.length > 140 ? `${entry.description.slice(0, 140)}…` : entry.description,
    language: entry.language ?? "",
    stars: entry.stars ? compact.format(entry.stars) : "",
    tier: entry.prTier ? prTierLabel(entry.prTier, locale) : "",
    scope: scopeLabel(scopeOf(entry), locale),
    faces: merged.slice(0, CARD_FACES).map((person) => ({ id: person.id, handle: person.handle })),
    merged: merged.length,
  };
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** A short, stable name for a card's content: FNV-1a over its fields, in base 36. */
export function cardVersion(fields: RepoCardFields): string {
  const text = JSON.stringify(fields);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The card's address for a version of it. */
export function repoCardPath(repo: string, version: string): string {
  return `${repoPagePath(repo)}/card?v=${version}`;
}
