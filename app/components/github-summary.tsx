import type { ReactNode } from "react";
import Link from "@/app/components/responsive-link";
import type { GitHubProfile } from "../lib/github-profile";
import type { ReadmeInline } from "../lib/readme";
import { tx, type Locale } from "../lib/locale";
import { ownerAvatar } from "../lib/github-activity";
import { repoPagePath } from "../lib/directory";
import type { OssMember } from "../lib/oss";

/**
 * A member's open source work on their profile: where their merged pull
 * requests landed — with who else from the community got merged there — those
 * still in review.
 */
export function GitHubSummary({
  profile,
  locale,
  afterMerged,
  listed = [],
  alongside = {},
}: {
  profile: GitHubProfile;
  locale: Locale;
  afterMerged?: ReactNode;
  /** Repos listed in the directory, `owner/name` in lower case: their box opens the repo's page here. */
  listed?: string[];
  /** Per repo, other members who got merged there. */
  alongside?: Record<string, OssMember[]>;
}) {
  const { login, open, merged } = profile;
  const openShown = open.slice(0, 6);
  const mergedShown = merged.repos.slice(0, 8);

  return (
    <>
      <section className="pf-section" aria-labelledby="gh-merged-heading">
        <div className="pf-section-head">
          <h2 id="gh-merged-heading">
            {tx(locale, "Kontribusi", "Contributions")} <span className="pf-count">{merged.count}</span>
          </h2>
          {merged.count > 0 ? (
            <a href={searchUrl(login, "merged")} target="_blank" rel="noreferrer">
              {tx(locale, "Semua di GitHub", "All on GitHub")} ↗
            </a>
          ) : null}
        </div>
        <p className="pf-note gh-merged-note">
          {tx(locale, "PR yang sudah di-merge ke project orang lain, per repo.", "Pull requests merged into other people's projects, by repo.")}
        </p>
        {mergedShown.length > 0 ? (
          <ul className="gh-merged-grid">
            {mergedShown.map((repo) => {
              const [owner, name] = repo.repo.split("/");
              const key = repo.repo.toLowerCase();
              const others = alongside[key] ?? [];
              const card = (
                <>
                  <span className="gh-merged-repo">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the repository owner's GitHub picture */}
                    <img src={ownerAvatar(repo.repo, 64)} alt="" width={28} height={28} loading="lazy" />
                    <span>
                      <small>{owner}</small>
                      <strong>{name}</strong>
                    </span>
                  </span>
                  <span className="gh-merged-count">
                    <strong>{repo.merged}</strong> {tx(locale, "PR merged", repo.merged === 1 ? "PR merged" : "PRs merged")}
                  </span>
                  <span className="gh-merged-meta">
                    {repo.stars > 0 ? <span>★ {compact(repo.stars)}</span> : null}
                    <span>{tx(locale, `terakhir ${on(repo.lastMergedAt, locale)}`, `last ${on(repo.lastMergedAt, locale)}`)}</span>
                  </span>
                  {others.length > 0 ? (
                    <span className="gh-merged-with">
                      <span className="gh-merged-faces" aria-hidden="true">
                        {others.slice(0, 3).map((member) => (
                          // eslint-disable-next-line @next/next/no-img-element -- the member's GitHub picture
                          <img key={member.username} src={`https://github.com/${encodeURIComponent(member.handle)}.png?size=40`} alt="" width={18} height={18} loading="lazy" />
                        ))}
                      </span>
                      {tx(locale, "bareng", "with")} {others[0].name || others[0].handle}
                      {others.length > 1 ? ` +${others.length - 1}` : ""}
                    </span>
                  ) : null}
                </>
              );
              return (
                <li key={repo.repo}>
                  {listed.includes(key) ? (
                    <Link href={repoPagePath(key)}>{card}</Link>
                  ) : (
                    <a href={`${repo.url}/pulls?q=${encodeURIComponent(`is:pr is:merged author:${login}`)}`} target="_blank" rel="noreferrer">
                      {card}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="oss-record-empty">{tx(locale, "Belum ada PR yang di-merge ke repo orang lain.", "No pull requests merged into other people's repos yet.")}</p>
        )}
        {merged.more ? (
          <p className="pf-note">{tx(locale, `Dihitung dari ${merged.repos.reduce((sum, repo) => sum + repo.merged, 0)} PR terakhir.`, `Grouped from the latest ${merged.repos.reduce((sum, repo) => sum + repo.merged, 0)} pull requests.`)}</p>
        ) : null}
      </section>

      {afterMerged}

      <section className="pf-section" aria-labelledby="gh-open-heading">
        <div className="pf-section-head">
          <h2 id="gh-open-heading">
            {tx(locale, "Sedang direview", "In review")} <span className="pf-count">{open.length}</span>
          </h2>
          {open.length > openShown.length ? (
            <a href={searchUrl(login, "open")} target="_blank" rel="noreferrer">
              {tx(locale, "Semua di GitHub", "All on GitHub")} ↗
            </a>
          ) : null}
        </div>
        {openShown.length > 0 ? (
          <ul className="gh-rows">
            {openShown.map((pr) => (
              <li key={pr.url}>
                <a className="gh-row" href={pr.url} target="_blank" rel="noreferrer">
                  <span className="gh-row-repo">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the repository owner's GitHub picture */}
                    <img src={ownerAvatar(pr.repo, 32)} alt="" width={16} height={16} loading="lazy" />
                    {pr.repo}
                  </span>
                  <span className="gh-row-title">{pr.title}</span>
                  <span className="gh-row-meta">
                    {pr.draft ? <span className="gh-draft">draft</span> : null}#{pr.number} · {on(pr.openedAt, locale)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="oss-record-empty">{tx(locale, "Tidak ada PR terbuka ke repo orang lain.", "No open pull requests to other people's repos.")}</p>
        )}
      </section>
    </>
  );
}

/**
 * Their GitHub profile README as the profile's description: the words only,
 * rendered as text (see lib/readme.ts), with the whole thing a click away.
 */
export function GitHubReadme({ profile, locale }: { profile: GitHubProfile; locale: Locale }) {
  return (
    <div className="pf-readme">
      {profile.readme.map((block, index) =>
        block.kind === "heading" ? (
          <h3 key={index}>
            <Inlines parts={block.inlines} />
          </h3>
        ) : block.kind === "list" ? (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inlines parts={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Inlines parts={block.inlines} />
          </p>
        ),
      )}
      <a className="pf-readme-source" href={`https://github.com/${profile.login}`} target="_blank" rel="noreferrer">
        {tx(locale, "README di GitHub", "README on GitHub")} ↗
      </a>
    </div>
  );
}

function Inlines({ parts }: { parts: ReadmeInline[] }) {
  return parts.map((part, index) =>
    part.kind === "link" ? (
      <a key={index} href={part.href} target="_blank" rel="noreferrer nofollow">
        {part.text}
      </a>
    ) : part.kind === "strong" ? (
      <strong key={index}>{part.text}</strong>
    ) : part.kind === "em" ? (
      <em key={index}>{part.text}</em>
    ) : part.kind === "code" ? (
      <code key={index}>{part.text}</code>
    ) : (
      part.text
    ),
  );
}

function searchUrl(login: string, state: "open" | "merged"): string {
  return `https://github.com/pulls?q=${encodeURIComponent(`is:pr is:public is:${state} author:${login} -user:${login}`)}`;
}

function compact(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value);
}

/**
 * "23 Okt 2026": a date rather than "3 days ago", which would change by the
 * minute and could not be prerendered or cached.
 */
function on(iso: string, locale: Locale): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(time);
}
