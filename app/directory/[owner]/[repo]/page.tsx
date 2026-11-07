import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "@/app/components/responsive-link";
import { SiteFooter, SiteHeader } from "../../../components/shell";
import { BadgeChip, BadgeIcon, LanguageDot, PrTierPill, SharedByLine } from "../../../components/directory-view";
import { StarCount, StarLink } from "../../../components/star-button";
import { RelativeTime } from "../../../components/relative-time";
import { ShareProfileButton } from "../../../components/share-profile-button";
import { PullRequestIcon } from "../../../components/activity-view";
import { badgeLabel } from "../../../lib/badges";
import { repoPagePath, scopeLabel, scopeOf, type DirectoryEntry } from "../../../lib/directory";
import { findListedRepo, listedRepos } from "../../../lib/directory-read";
import { listGitHubActivity } from "../../../lib/data";
import { repoCommunity, type ActivityPerson, type GitHubActivityEntry } from "../../../lib/github-activity";
import { readPublicly } from "../../../lib/public-read";
import { currentLocale } from "../../../lib/locale-server";
import { tx } from "../../../lib/locale";
import { isOss, site } from "../../../lib/site";
import { cardVersion, repoCardFields, repoCardPath } from "../../../lib/repo-card";
import { OG_SIZE } from "../../../components/og-parts";

type Params = Promise<{ owner: string; repo: string }>;

/** The community's latest pull requests shown on the page; the rest are on GitHub. */
const PULL_REQUESTS_SHOWN = 10;

/**
 * Prime every listed repo's page. The list is short and curated, so all of it
 * is prerendered; a repo listed after the deploy upgrades on its first visit.
 * Cache Components wants at least one: with none, a placeholder that is not
 * found.
 */
export async function generateStaticParams(): Promise<{ owner: string; repo: string }[]> {
  if (isOss) {
    const repos = await listedRepos("id");
    if (repos.length > 0) return repos.map((repo) => ({ owner: repo.split("/")[0], repo: repo.split("/")[1] }));
  }
  return [{ owner: "_", repo: "_" }];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ owner, repo }, locale] = await Promise.all([params, currentLocale()]);
  const entry = isOss ? await findListedRepo(locale, owner, repo) : null;
  if (!entry?.repo) return { title: tx(locale, `Repo tidak ditemukan — ${site.name}`, `Repo not found — ${site.name}`) };

  const title = `${githubName(entry)} — ${site.name}`;
  const description =
    entry.description ||
    tx(locale, "Repo open source kurasi komunitas swegrowth, tempat yang bagus buat mulai kontribusi.", "An open source repo curated by the swegrowth community, a good place to start contributing.");
  // The card from card/route.tsx, named by a version of what it shows, so a
  // changed card is a new address for chat apps and the CDN alike.
  const activity = await readPublicly<GitHubActivityEntry[]>("github activity for a repo card", listGitHubActivity, []);
  const card = repoCardPath(entry.repo, cardVersion(repoCardFields(entry, repoCommunity(activity.value, entry.repo).merged, locale)));
  const image = { url: card, width: OG_SIZE.width, height: OG_SIZE.height, alt: site.name };
  return {
    title,
    description,
    alternates: { canonical: repoPagePath(entry.repo) },
    openGraph: { type: "article", title, description, url: repoPagePath(entry.repo), images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/**
 * A listed repository's own page — the link a member shares when a repo is
 * looking for contributors. What the directory's card says about it, then
 * what only this site knows: who from the community has been merged there,
 * and their latest pull requests to it. GitHub stays one click away.
 *
 * Only what the directory lists has a page; a repo that only turns up in
 * members' activity links to GitHub, as before.
 */
export default async function RepoPage({ params }: { params: Params }) {
  const [{ owner, repo }, locale] = await Promise.all([params, currentLocale()]);
  const entry = isOss ? await findListedRepo(locale, owner, repo) : null;
  if (!entry?.repo) notFound();
  // One address per repo, however it was typed.
  if (`${owner}/${repo}` !== entry.repo) permanentRedirect(repoPagePath(entry.repo));

  const activity = await readPublicly<GitHubActivityEntry[]>("github activity on a repo page", listGitHubActivity, []);
  const community = repoCommunity(activity.value, entry.repo);
  const name = githubName(entry);
  const [ownerName, repoName] = name.split("/");
  const issues = entry.actionKind === "issues";
  const badges = entry.badges.filter((badge) => badge.kind !== "admin-pick");
  const external = { target: "_blank", rel: "noopener noreferrer" };

  return (
    <>
      <SiteHeader returnTo={repoPagePath(entry.repo)} active="directory" />

      <main id="main-content" className="dx-page rp-page">
        <p className="breadcrumb">
          <Link href="/directory">{tx(locale, "Direktori", "Directory")}</Link> <span aria-hidden="true">/</span> {name}
        </p>

        <header className="rp-head">
          {/* eslint-disable-next-line @next/next/no-img-element -- the repository owner's GitHub picture */}
          <img className="rp-avatar" src={`https://github.com/${encodeURIComponent(ownerName)}.png?size=112`} alt="" width={56} height={56} />
          <div className="rp-head-copy">
            <h1>
              <span className="rp-owner">{ownerName}/</span>
              <wbr />
              {repoName}
            </h1>
            <p className="rp-flags">
              {entry.prTier ? <PrTierPill tier={entry.prTier} locale={locale} /> : null}
              <span className="rp-scope">{scopeLabel(scopeOf(entry), locale)}</span>
              {entry.adminPick ? (
                <span className="rp-pick">
                  <BadgeIcon kind="admin-pick" />
                  {badgeLabel({ kind: "admin-pick" }, locale)}
                </span>
              ) : null}
            </p>
            {entry.description ? <p className="rp-desc">{entry.description}</p> : null}
            {entry.sharedBy ? <SharedByLine sharedBy={entry.sharedBy} locale={locale} /> : null}
            {entry.language || entry.stars !== null || entry.updatedAt ? (
              <p className="dx-meta">
                {entry.language ? <span className="dx-lang"><LanguageDot language={entry.language} />{entry.language}</span> : null}
                {entry.stars !== null ? <StarCount stars={entry.stars} /> : null}
                {entry.updatedAt ? (
                  <span title={tx(locale, "Push terakhir ke repo, termasuk dari bot", "The repo's last push, bots included")}>
                    {tx(locale, "Push terakhir ", "Last push ")}
                    <RelativeTime value={entry.updatedAt} locale={locale} />
                  </span>
                ) : null}
              </p>
            ) : null}
            <div className="rp-actions">
              <a className="dx-action" href={entry.actionHref} {...external}>
                {issues ? tx(locale, "Isu pemula di GitHub", "Starter issues on GitHub") : tx(locale, "Buka di GitHub", "Open on GitHub")}{" "}
                <span aria-hidden="true">↗</span>
              </a>
              <StarLink repo={name} />
              <div className="rp-share">
                <ShareProfileButton subject="repo" name={name} path={repoPagePath(entry.repo)} />
              </div>
            </div>
          </div>
        </header>

        {badges.length > 0 || entry.labels.length > 0 || entry.why ? (
          <section className="rp-why" aria-label={tx(locale, "Kenapa repo ini", "Why this repo")}>
            {entry.why ? <p className="rp-why-quote">{entry.why}</p> : null}
            {badges.length > 0 ? (
              <ul className="dx-badges" aria-label={tx(locale, "Tanda", "Signals")}>
                {badges.map((badge) => <BadgeChip key={badge.kind} badge={badge} locale={locale} />)}
              </ul>
            ) : null}
            {entry.labels.length > 0 ? (
              <p className="dx-tags">
                {entry.labels.map((label) => <span key={label} className="dx-tag">{label}</span>)}
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="rp-community">
          <section className="pf-section" aria-labelledby="rp-people-heading">
            <div className="pf-section-head">
              <h2 id="rp-people-heading">
                {tx(locale, "Member yang sudah di-merge", "Members merged here")} <span className="pf-count">{community.merged.length}</span>
              </h2>
            </div>
            {community.merged.length > 0 ? (
              <People people={community.merged} />
            ) : (
              <p className="oss-record-empty">
                {tx(locale, "Belum ada member komunitas yang PR-nya di-merge di sini. Jadi yang pertama!", "No community member has had a PR merged here yet. Be the first!")}
              </p>
            )}
            {community.inReview.length > 0 ? (
              <>
                <h3 className="rp-subhead">{tx(locale, "Sedang direview", "In review")}</h3>
                <People people={community.inReview} />
              </>
            ) : null}
          </section>

          <section className="pf-section" aria-labelledby="rp-prs-heading">
            <div className="pf-section-head">
              <h2 id="rp-prs-heading">
                {tx(locale, "PR terbaru dari komunitas", "Latest community PRs")} <span className="pf-count">{community.pullRequests.length}</span>
              </h2>
              {community.pullRequests.length > 0 ? (
                <Link href={`/?repo=${encodeURIComponent(entry.repo)}`}>{tx(locale, "Di Aktivitas", "On Activity")} →</Link>
              ) : null}
            </div>
            {community.pullRequests.length > 0 ? (
              <ul className="gh-rows rp-prs">
                {/* Merged first, as on a profile; each kind newest first. */}
                {[...community.pullRequests]
                  .sort((a, b) => Number(b.state === "merged") - Number(a.state === "merged"))
                  .slice(0, PULL_REQUESTS_SHOWN)
                  .map((pr) => (
                  <li key={pr.url}>
                    <a className="gh-row" href={pr.url} {...external}>
                      <span className="gh-row-repo rp-pr-who">
                        <PullRequestIcon merged={pr.state === "merged"} />
                        {/* eslint-disable-next-line @next/next/no-img-element -- the member's GitHub picture */}
                        <img src={`https://github.com/${encodeURIComponent(pr.person.handle)}.png?size=32`} alt="" width={16} height={16} loading="lazy" />
                        {pr.person.name || `@${pr.person.handle}`}
                      </span>
                      <span className="gh-row-title">{pr.title}</span>
                      <span className="gh-row-meta">
                        {pr.state === "merged" ? tx(locale, "di-merge ", "merged ") : tx(locale, "dibuka ", "opened ")}
                        <RelativeTime value={pr.at} locale={locale} />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="oss-record-empty">{tx(locale, "Belum ada PR dari komunitas ke repo ini.", "No pull requests from the community to this repo yet.")}</p>
            )}
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

/** `owner/name` in GitHub's own spelling, which the card titles itself with. */
function githubName(entry: DirectoryEntry): string {
  return entry.links.find((link) => link.kind === "github")?.label ?? `${entry.owner}/${entry.name}`;
}

/** Members as faces with their names, each opening their profile here. */
function People({ people }: { people: ActivityPerson[] }) {
  return (
    <ul className="rp-people">
      {people.map((person) => (
        <li key={person.id}>
          <Link href={`/u/${person.username}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the member's GitHub picture */}
            <img src={`https://github.com/${encodeURIComponent(person.handle)}.png?size=64`} alt="" width={32} height={32} loading="lazy" />
            <span>{person.name || `@${person.handle}`}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

