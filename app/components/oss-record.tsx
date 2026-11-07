import Link from "@/app/components/responsive-link";
import { addOssContribution, removeOssContribution } from "../actions";
import { SubmitButton } from "./submit-button";
import { LanguageDot, PrTierPill } from "./directory-view";
import { contributionEvidenceUrl, type OssContribution } from "../lib/oss";
import { repoPagePath, type PRTier } from "../lib/directory";
import { tx, type Locale } from "../lib/locale";

/**
 * A member's open source record: the repos they have contributed to or
 * maintain. The onboarding page embeds the add form; the profile editor shows
 * the whole record; the public profile reads it through `OssRecordList`.
 */

/** What the last add or remove said, from `?oss=` — the forms post without JavaScript. */
export function OssStatus({ status, locale }: { status: string; locale: Locale }) {
  const message =
    status === "added"
      ? tx(locale, "Tersimpan. Badge-mu muncul di direktori.", "Saved. Your badge now shows in the directory.")
      : status === "exists"
        ? tx(locale, "Repo itu sudah ada di catatanmu.", "That repo is already on your record.")
        : status === "invalid"
          ? tx(locale, "Tulis sebagai owner/repo atau tempel URL GitHub-nya.", "Write it as owner/repo or paste its GitHub URL.")
          : status === "removed"
            ? tx(locale, "Dihapus dari catatanmu.", "Removed from your record.")
            : "";
  if (!message) return null;
  return <p className={`oss-status ${status === "invalid" ? "is-error" : ""}`} role="status">{message}</p>;
}

export function OssAddForm({ status, locale }: { status: string; locale: Locale }) {
  return (
    <form className="oss-add-form" action={addOssContribution}>
      <OssStatus status={status} locale={locale} />
      <div className="oss-add-row">
        <label className="sr-only" htmlFor="profile-repo">{tx(locale, "Repo GitHub", "GitHub repo")}</label>
        <input id="profile-repo" name="repo" type="text" required placeholder={tx(locale, "owner/repo atau URL GitHub", "owner/repo or a GitHub URL")} autoComplete="off" />
        <select name="relation" defaultValue="contributor" aria-label={tx(locale, "Peranmu di repo ini", "Your part in this repo")}>
          <option value="contributor">{tx(locale, "Kontributor", "Contributor")}</option>
          <option value="maintainer">Maintainer</option>
        </select>
        <SubmitButton pendingLabel={tx(locale, "Menyimpan…", "Saving…")}>{tx(locale, "Tambah", "Add")}</SubmitButton>
      </div>
    </form>
  );
}

/**
 * The record as a list. Each row links to the person's pull requests on that
 * repo — the claim and its evidence side by side — and, for its owner, a
 * button to take it off.
 */
export function OssRecordList({
  records,
  handle,
  editable = false,
  briefs = {},
  locale,
}: {
  records: OssContribution[];
  /** The person's GitHub username; without it there is no evidence link. */
  handle: string;
  editable?: boolean;
  /** Per repo, what it is: from its card in the directory, or else from GitHub. */
  briefs?: Record<string, RepoBrief>;
  locale: Locale;
}) {
  return (
    <ul className="oss-record">
      {records.map((record) => (
        <li key={record.repo}>
          <RelationIcon relation={record.relation} />
          <div className="oss-record-copy">
            {briefs[record.repo]?.listed ? (
              <Link href={repoPagePath(record.repo)}>
                <span className="oss-record-owner">{record.repo.split("/")[0]}/</span>
                <wbr />
                {record.repo.split("/")[1]}
              </Link>
            ) : (
              <a href={`https://github.com/${record.repo}`} target="_blank" rel="noopener noreferrer">
                <span className="oss-record-owner">{record.repo.split("/")[0]}/</span>
                {/* When it has to wrap, the break goes after the slash, not inside the name. */}
                <wbr />
                {record.repo.split("/")[1]}
              </a>
            )}
            <span className={`oss-record-relation oss-record-${record.relation}`}>
              {record.relation === "maintainer" ? "Maintainer" : tx(locale, "Kontributor", "Contributor")}
            </span>
            {record.verified ? (
              <span className="oss-record-verified" title={tx(locale, "Ada PR yang sudah di-merge, menurut GitHub", "A pull request was merged, as GitHub reports it")}>
                {tx(locale, "✓ PR merged", "✓ PR merged")}
              </span>
            ) : null}
            <RepoDetail brief={briefs[record.repo]} locale={locale} />
          </div>
          {handle ? (
            <a className="oss-record-evidence" href={contributionEvidenceUrl(record.repo, handle)} target="_blank" rel="noopener noreferrer">
              {tx(locale, "Lihat PR", "See PRs")} <span aria-hidden="true">↗</span>
            </a>
          ) : null}
          {/* Only what they typed is theirs to remove: a repository GitHub
              vouches for stays while their Activity consent does. */}
          {editable && record.manual !== false ? (
            <form action={removeOssContribution}>
              <input type="hidden" name="repo" value={record.repo} />
              <SubmitButton className="oss-record-remove" aria-label={tx(locale, `Hapus ${record.repo}`, `Remove ${record.repo}`)}>
                {tx(locale, "Hapus", "Remove")}
              </SubmitButton>
            </form>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** A repo for a maintainer, a merge for a contributor: in the colours of their pills. */
function RelationIcon({ relation }: { relation: OssContribution["relation"] }) {
  return (
    <span className={`oss-record-icon oss-record-${relation}`} aria-hidden="true">
      <svg viewBox="0 0 16 16">
        {relation === "maintainer" ? (
          <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1H13v11H4.5a1.5 1.5 0 0 0 0 3H13M3 2.5v11M6 4h4" />
        ) : (
          <>
            <circle cx="4" cy="3.5" r="1.5" />
            <circle cx="4" cy="12.5" r="1.5" />
            <circle cx="12" cy="8" r="1.5" />
            <path d="M4 5v6M4 5a5 5 0 0 0 6.5 3" />
          </>
        )}
      </svg>
    </span>
  );
}

/** A repo in brief, for the record: what it is, whether it is in the directory, and its numbers. */
export type RepoBrief = {
  description: string;
  /** Listed in the directory: the name opens its page here. */
  listed: boolean;
  prTier: PRTier | null;
  language: string;
  /** GitHub's colour for the language, when GitHub gave one. */
  languageColor?: string;
  stars: number;
};

function RepoDetail({ brief, locale }: { brief?: RepoBrief; locale: Locale }) {
  if (!brief || (!brief.description && !brief.prTier && !brief.language && !brief.stars)) return null;
  return (
    <span className="oss-record-detail">
      {brief.description ? <span className="oss-record-desc">{brief.description}</span> : null}
      <span className="oss-record-meta">
        {brief.prTier ? <PrTierPill tier={brief.prTier} locale={locale} /> : null}
        {brief.language ? (
          <span>
            {brief.languageColor ? <span className="dx-lang-dot" style={{ background: brief.languageColor }} aria-hidden="true" /> : <LanguageDot language={brief.language} />}{" "}
            {brief.language}
          </span>
        ) : null}
        {brief.stars ? <span>★ {brief.stars >= 1000 ? `${(brief.stars / 1000).toFixed(1)}k` : brief.stars}</span> : null}
      </span>
    </span>
  );
}

/** The empty state, with the way to fill it when it is the viewer's own. */
export function OssRecordEmpty({ self, locale }: { self: boolean; locale: Locale }) {
  return (
    <p className="oss-record-empty">
      {self
        ? tx(locale, "Belum ada repo yang kamu catat. ", "You have not listed any repos yet. ")
        : tx(locale, "Belum ada repo open source yang dicatat.", "No open source repos listed yet.")}
      {self ? <Link href="/account/profile#open-source">{tx(locale, "Catat sekarang", "List one now")}</Link> : null}
    </p>
  );
}
