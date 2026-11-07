"use client";

import { useActionState } from "react";
import { saveGitHub, type GitHubState } from "../actions";
import { useLanguage } from "./language-provider";
import type { GitHubLinkFailure } from "../lib/urls";

/**
 * The GitHub account, first on /account/profile: the directory's badges, the
 * profile picture and the Activity page are all built from it. The yes to
 * /activity sits with it, since it is about this account and nothing else.
 *
 * The account is linked through GitHub's own sign-in, never typed: a typed
 * handle could be anybody's, and everything built from it would then show
 * somebody else's work as this member's (#209). Signing in with GitHub links
 * it already; anyone else links it here.
 */
export function GitHubForm({
  handle,
  typed,
  shown,
  linkFailure,
}: {
  /** The linked account's login, or empty. */
  handle: string;
  /** A handle typed before accounts had to be linked, to say what to link. */
  typed: string;
  shown: boolean;
  /** Why the last attempt to link or unlink GitHub did not happen. */
  linkFailure?: GitHubLinkFailure;
}) {
  const [state, formAction, pending] = useActionState(saveGitHub, {
    errors: {},
    values: { shown },
  } satisfies GitHubState);
  const { errors, values } = state;
  const { tx } = useLanguage();
  const linkHref = `/auth/github?next=${encodeURIComponent("/account/profile")}`;
  // Switched, never unlinked: somebody who signs in with GitHub must keep a
  // GitHub account to sign in with.
  const switchHref = `/auth/github?switch=1&next=${encodeURIComponent("/account/profile")}`;

  return (
    <form className="create-form gh-form" action={formAction} id="github-account">
      <fieldset className="step tone-account">
        <legend>
          <span className="step-number">1</span> GitHub
        </legend>
        <p className="step-intro">
          {tx(
            "Akun yang kamu pakai untuk kirim PR. Fotonya muncul di badge direktori dan di profilmu, dan dari sini orang bisa melihat kontribusimu.",
            "The account you send pull requests from. Its picture shows on directory badges and on your profile, and it is how people find your contributions.",
          )}
        </p>
        {errors.form ? (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        ) : null}

        {linkFailure ? (
          <p className="form-error" role="alert">
            {linkFailure === "taken"
              ? tx(
                  "Akun GitHub itu sudah tertaut ke akun lain di sini. Masuk dengan akun itu untuk melepaskannya dulu, atau tautkan akun GitHub yang lain.",
                  "That GitHub account is already linked to another account here. Sign in with that account to unlink it first, or link a different GitHub account.",
                )
              : linkFailure === "same"
                ? tx(
                    "GitHub mengembalikan akun yang sama. Pindah dulu ke akun GitHub yang lain di github.com, lalu ganti lagi.",
                    "GitHub returned the same account. Switch to the other account on github.com first, then try again.",
                  )
                : tx("GitHub belum bisa ditautkan. Coba lagi sebentar lagi.", "GitHub could not be linked. Please try again shortly.")}
          </p>
        ) : null}

        {handle ? (
          <>
            <div className="gh-linked">
              {/* eslint-disable-next-line @next/next/no-img-element -- the member's GitHub picture */}
              <img src={`https://github.com/${encodeURIComponent(handle)}.png?size=64`} alt="" width={32} height={32} />
              <a href={`https://github.com/${handle}`} target="_blank" rel="noopener noreferrer">
                @{handle}
              </a>
              <span className="gh-linked-mark">✓ {tx("Tertaut", "Linked")}</span>
              <a className="text-button" href={switchHref}>
                {tx("Ganti akun", "Switch account")}
              </a>
            </div>
            <p className="hint">
              {tx(
                "Mau ganti? Pindah dulu ke akun GitHub yang lain di github.com. Setelah diganti, masuk ke sini dengan akun GitHub yang baru.",
                "Switching? Change to the other account on github.com first. Afterwards, sign in here with the new GitHub account.",
              )}
            </p>
          </>
        ) : (
          <div className="gh-link">
            {typed ? (
              <p className="gh-link-note" role="status">
                {tx(
                  `Dulu kamu mengisi ${typed} sebagai GitHub-mu. Sekarang akun GitHub harus ditautkan supaya aktivitas dan badge-mu tampil—cuma sekali, lewat login GitHub.`,
                  `You entered ${typed} as your GitHub before. GitHub accounts now have to be linked for your activity and badges to show—just once, through GitHub sign-in.`,
                )}
              </p>
            ) : null}
            <a className="google-auth-button auth-provider-github" href={linkHref}>
              <span>{tx("Tautkan akun GitHub", "Link your GitHub account")}</span>
            </a>
            <p className="hint">
              {tx(
                "Kami hanya menerima username GitHub-mu—tidak bisa menyentuh kode atau repo-mu.",
                "We only receive your GitHub username—nothing that can touch your code or repositories.",
              )}
            </p>
          </div>
        )}

        <div className="gh-consent">
          <label htmlFor="github-activity">
            <input id="github-activity" type="checkbox" name="github_activity" value="1" defaultChecked={values.shown} disabled={!handle} />
            {tx("Tampilkan aktivitas GitHub-ku di halaman Aktivitas", "Show my GitHub activity on the Activity page")}
          </label>
          <p className="hint">
            {handle
              ? tx(
                  "Opsional, mati sampai kamu menyalakannya. Kalau dicentang, pull request dan jumlah commit publikmu muncul di halaman Aktivitas dalam beberapa menit, lalu diperbarui otomatis dari GitHub tiap 6 jam. Hilangkan centangnya kapan saja: datanya langsung disembunyikan lalu dihapus.",
                  "Optional, and off until you turn it on. When ticked, your public pull requests and commit counts show on the Activity page within a few minutes, then refresh from GitHub every 6 hours on their own. Untick it any time: they are hidden at once, then deleted.",
                )
              : tx("Tautkan akun GitHub-mu dulu untuk menyalakannya.", "Link your GitHub account first to turn this on.")}
          </p>
        </div>

        {handle ? (
          <div className="gh-form-actions">
            <button className="ghost-button" type="submit" disabled={pending} aria-busy={pending || undefined}>
              {pending ? tx("Menyimpan…", "Saving…") : tx("Simpan", "Save")}
            </button>
            {state.saved && !pending ? (
              <span className="gh-form-saved" role="status">
                {/* Saying yes asks GitHub at once, but the Activity page is cached
                    for a few minutes: say so, rather than let an empty page look broken. */}
                {values.shown
                  ? tx("Tersimpan. Aktivitasmu muncul di halaman Aktivitas dalam beberapa menit.", "Saved. Your activity shows on the Activity page within a few minutes.")
                  : tx("Tersimpan.", "Saved.")}
              </span>
            ) : null}
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
