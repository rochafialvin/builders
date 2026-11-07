import { isOss, site } from "./lib/site";

/** Canonical origin for metadata, share cards, and the sitemap — this build's site (see lib/site.ts). */
export const siteUrl = site.url;

/** This site's own repository, `owner/name` — the site is open source too. */
export const sourceRepo = "swegrowthid/builders";

/**
 * The WhatsApp community where members share what they are working on: one
 * group per site, open source contributors on oss and builders on builders.
 * Empty hides the link everywhere it appears.
 */
export const waCommunityUrl = isOss
  ? "https://chat.whatsapp.com/IEMvtgU6mNZAZ6oBd5lJb6"
  : "https://chat.whatsapp.com/KPJDVO9A6RBLNa6HG2dQlF";

/**
 * ContribReady: global open source repos that welcome outside PRs, refreshed
 * daily. Where the open source directory sends somebody who wants more global
 * repos than it lists.
 */
export const contribReadyUrl = "https://contrib.idnremote.com";

/**
 * The issue where the leaderboard's points and gamification are being worked
 * out; the board links there for ideas.
 */
export const leaderboardIssueUrl = `https://github.com/${sourceRepo}/issues/186`;


/**
 * The SWE Growth admin's WhatsApp (0823-3858-8078), in international form.
 * For now an offer to help on a product's role goes here rather than through
 * proposals on the site.
 */
const WA_ADMIN = "6282338588078";

/** A chat with the admin, for whoever wants to ask before joining the community. */
export function waAdminUrl(text: string): string {
  return `https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(text)}`;
}

/** A chat with the admin, the message already written: the project and the role. */
export function waOfferHelpUrl(project: string, role: string): string {
  return waAdminUrl(`Halo Admin SWE Growth, saya tertarik untuk kontribusi pada ${project} sebagai ${role}.`);
}

/** The shared picture, for pages that do not draw a card of their own. */
export const defaultShareImage = { url: "/opengraph-image", width: 1200, height: 630 };

/**
 * Share-card fields for a page with no `opengraph-image` file beside it.
 *
 * Next.js replaces the whole `openGraph` object rather than merging into the
 * one on the layout, so a page that names its own title has to re-state the
 * image too — otherwise it quietly ships a card with no picture at all.
 * Pages that do have an `opengraph-image` file (profiles, projects) get their
 * image from that file and should not call this.
 */
export function shareCard(fields: {
  title: string;
  description: string;
  url: string;
  locale?: string;
}) {
  return { ...fields, images: [defaultShareImage] };
}
