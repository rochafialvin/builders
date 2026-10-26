import type { Metadata } from "next";
import Link from "@/app/components/responsive-link";
import { redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "../../components/shell";
import { ProfileForm, type EditableProfile } from "../../components/profile-form";
import { GitHubForm } from "../../components/github-form";
import { listOssContributionsOf, listPeople } from "../../lib/data";
import { OssAddForm, OssRecordEmpty, OssRecordList } from "../../components/oss-record";
import { githubHandle } from "../../lib/oss";
import { termSuggestions } from "../../lib/people";
import { readPublicly } from "../../lib/public-read";
import { currentViewer, type Viewer } from "../../lib/session";
import { signInPath } from "../../lib/urls";
import { currentLocale } from "../../lib/locale-server";
import { tx } from "../../lib/locale";
import { site } from "../../lib/site";

/*
 * Do not serve this page from the client router cache on regular
 * navigations: after "Save profile" redirects to /u/<name>?saved=1, coming
 * back via "Edit profile" must show the just-saved values, not the
 * 120-second-old ones (staleTimes.dynamic). Back/forward restores may still
 * replay the browser's bfcache copy by design.
 */
export const unstable_dynamicStaleTime = 0;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  return {
    title: tx(locale, `Edit profil — ${site.name}`, `Edit profile — ${site.name}`),
    description: tx(locale, `Atur akun GitHub, kontribusi open source, dan profilmu di ${site.name}.`, `Set your GitHub account, open source contributions, and profile on ${site.name}.`),
    robots: { index: false },
  };
}

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; oss?: string | string[] }>;
}) {
  const [viewer, locale] = await Promise.all([currentViewer(), currentLocale()]);
  if (!viewer) redirect(signInPath("/account/profile"));
  const query = await searchParams;
  const requestedReturnTo = Array.isArray(query.returnTo) ? query.returnTo[0] : query.returnTo;
  // This is only a convenience after a blocked proposal, never an external
  // redirect destination supplied by a query string.
  const returnTo = requestedReturnTo?.startsWith("/projects/") ? requestedReturnTo : undefined;

  // Suggestions only. If the directory cannot be read the form still works —
  // it just stops proposing the words other people already use.
  const [people, records] = await Promise.all([
    readPublicly("profile term suggestions", () => listPeople(400), []),
    readPublicly("open source record in the editor", () => listOssContributionsOf(viewer.id), []),
  ]);
  const ossStatus = typeof query.oss === "string" ? query.oss : "";
  const handle = githubHandle(viewer.github);
  // ProfileForm freezes the values it mounts with (useActionState initial
  // state), so it carries a key: returning here with newer data from the
  // server must remount it, or the inputs keep what they first rendered.
  // GitHubForm saves in place without navigating, so a key would remount it
  // on save and wipe its "Tersimpan." confirmation.
  const githubValue = handle ? `https://github.com/${handle}` : viewer.github;
  const editable = toEditable(viewer);

  return (
    <>
      <SiteHeader returnTo="/account/profile" />

      <main id="main-content" className="page-narrow account-page">
        <h1>{tx(locale, "Lengkapi profilmu.", "Complete your profile.")}</h1>
        <p className="lede">
          {tx(locale, "Yang paling penting ada di atas: akun GitHub dan repo yang pernah kamu kontribusi—dari situ badge di direktori dibuat. Sisanya tampil di ", "What matters most comes first: your GitHub account and the repos you have contributed to—the directory's badges are built from them. The rest shows on ")}
          <Link href={`/u/${viewer.username}`}>{tx(locale, "profilmu", "your profile")}</Link>.{" "}
          {tx(locale, "Setiap bagian disimpan sendiri-sendiri.", "Each section saves on its own.")}
        </p>

        {/* First, because the directory is built from it: the badge faces,
            the evidence links and the Activity page all read this account.
            A form of its own, since the open source record below is one too. */}
        <GitHubForm github={githubValue} shown={viewer.githubActivityShown} />

        {/* Second: every repo listed here becomes a badge on that repo's row. */}
        <section id="open-source" className="oss-editor tone-done" aria-labelledby="oss-editor-title">
          <h2 id="oss-editor-title" className="is-step">
            <span className="step-number">2</span> {tx(locale, "Kontribusi open source", "Open source contributions")}
          </h2>
          <p>
            {tx(
              locale,
              "Repo yang pernah kamu kontribusi atau kamu maintain. Masing-masing jadi badge di direktori — \"teman pernah kontribusi\" atau \"maintainer di grup kita\" — lengkap dengan fotomu.",
              "Repos you have contributed to or maintain. Each one becomes a badge in the directory — \"a friend has contributed\" or \"maintainer in our group\" — with your picture.",
            )}
          </p>
          {!handle ? (
            <p className="oss-editor-note">
              {tx(locale, "Isi GitHub-mu di atas supaya fotomu muncul di badge dan orang bisa melihat PR-mu.", "Add your GitHub above so your picture shows on badges and people can see your PRs.")}{" "}
              <a href="#github-account">{tx(locale, "Isi GitHub", "Add GitHub")}</a>
            </p>
          ) : null}
          {records.value.length > 0 ? (
            <OssRecordList records={records.value} handle={handle} editable locale={locale} />
          ) : (
            <OssRecordEmpty self={false} locale={locale} />
          )}
          <OssAddForm status={ossStatus} locale={locale} />
        </section>

        <ProfileForm
          key={JSON.stringify(editable)}
          profile={editable}
          skillSuggestions={termSuggestions(people.value, "skills")}
          returnTo={returnTo}
        />

        <p className="hint">
          {tx(locale, "URL profilmu—", "Your profile URL—")}<code>/u/{viewer.username}</code>{tx(locale, "—dibuat oleh sistem dan tidak dapat diubah di sini. Ubah kata sandimu di ", "—is created by the system and cannot be changed here. Change your password on the ")}<Link href="/account/password">{tx(locale, "halaman kata sandi", "password page")}</Link>.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}

/** The stored profile as the form's string fields. */
function toEditable(viewer: Viewer): EditableProfile {
  return {
    name: viewer.name,
    profession: viewer.profession,
    headline: viewer.headline,
    bio: viewer.bio,
    skills: viewer.skills.join(", "),
    website: viewer.website,
    publicEmail: viewer.publicEmail,
    linkedin: viewer.linkedin,
    x: viewer.x,
  };
}
