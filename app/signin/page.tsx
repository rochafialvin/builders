import type { Metadata } from "next";
import Link from "@/app/components/responsive-link";
import { redirect } from "next/navigation";
import { SiteFooter, SiteHeader } from "../components/shell";
import { ProviderButton, SignInForm } from "../components/auth-forms";
import { viewerId } from "../lib/session";
import { safeNextPath } from "../lib/urls";
import { supabaseConfigured } from "../lib/supabase";
import { currentLocale } from "../lib/locale-server";
import { tx } from "../lib/locale";
import { site } from "../lib/site";

/*
 * Allowed to block.
 *
 * This page decides what to render — or whether to redirect — from who is
 * signed in, and there is no useful shell to show before that answer arrives:
 * a visitor who is about to be sent elsewhere should not watch this page paint
 * first. Nothing here is cacheable and nothing here is indexed, so blocking on
 * the session costs a request that was always going to be per-visitor.
 */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  return {
    title: tx(locale, `Masuk — ${site.name}`, `Sign in — ${site.name}`),
    description: tx(locale, "Masuk untuk menampilkan proyekmu, bergabung dalam diskusi, dan membantu membangun proyek orang lain.", "Sign in to show your projects, join discussions, and help build other people's projects."),
    robots: { index: false },
  };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Why a confirmation link sent somebody back here. Set by /auth/confirm. */
const LINK_PROBLEMS: Record<string, { id: string; en: string }> = {
  "expired-link": { id: "Tautan konfirmasi ini telah kedaluwarsa atau sudah digunakan. Coba masuk, atau buat akun baru jika diperlukan.", en: "This confirmation link has expired or has already been used. Try signing in, or create a new account if needed." },
  "incomplete-link": { id: "Tautan konfirmasi ini tidak lengkap. Buka kembali tautan lengkap dari emailmu.", en: "This confirmation link is incomplete. Open the complete link from your email again." },
  "google-failed": { id: "Proses masuk dengan Google tidak berhasil. Coba lagi atau masuk dengan GitHub.", en: "Google sign-in did not work. Please try again or sign in with GitHub instead." },
  "github-failed": { id: "Proses masuk dengan GitHub tidak berhasil. Coba lagi atau gunakan cara lain.", en: "GitHub sign-in did not work. Please try again or use another way." },
  "origin-mismatch": {
    id: "Proses masuk dimulai dari satu alamat dan kembali ke alamat lain sehingga sesi tidak dapat dibuat. Buka situs pada alamat utamanya lalu coba lagi. Administrator situs harus mendaftarkan /auth/callback dan /auth/confirm untuk setiap alamat di Supabase → Authentication → URL Configuration.",
    en: "Sign-in started at one address and returned to another, so the session could not be created. Open the site at its primary address and try again. Site administrators should register /auth/callback and /auth/confirm for each address in Supabase → Authentication → URL Configuration.",
  },
};

export default async function SignInPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = (await searchParams) ?? {};
  const next = safeNextPath(typeof params.next === "string" ? params.next : "/");
  const locale = await currentLocale();

  // Only whether there is a session, not who it belongs to: this page either
  // bounces them or shows the form, and neither needs a profile.
  if (await viewerId()) redirect(next);

  const problem = typeof params.error === "string" ? LINK_PROBLEMS[params.error] : undefined;
  const linkProblem = problem ? tx(locale, problem.id, problem.en) : undefined;

  // GitHub first: the site is for people who write code, and only a GitHub
  // sign-in can show their GitHub activity. Google sits one click away under
  // "Other ways", on this same page. A GitHub or Google sign-in makes the
  // account on first use, so there is no separate sign-up.
  //
  // Password sign-in is no longer offered (#211): resetting one needs email
  // the site does not send. The form stays reachable at ?with=email, linked
  // from nowhere, for the few older accounts an admin points to it.
  const email = params.with === "email";
  const otherOpen = params.with === "google";

  return (
    <>
      <SiteHeader returnTo="/signin" />

      <main id="main-content" className="signin-simple">
        <section className="signin-simple-card" aria-labelledby="signin-heading">
          <h1 id="signin-heading">{tx(locale, `Masuk ke ${site.name}`, `Sign in to ${site.name}`)}</h1>
          <p className="signin-simple-lede">
            {email
              ? tx(locale, "Untuk akun lama yang dibuat dengan email dan kata sandi.", "For older accounts made with an email and password.")
              : tx(locale, "Akun dibuat otomatis saat pertama kali masuk.", "Your account is made the first time you sign in.")}
          </p>

          {linkProblem ? (
            <p className="form-error" role="alert">
              {linkProblem}
            </p>
          ) : null}

          {!supabaseConfigured() ? (
            <p className="form-error">
              {tx(locale, "Situs ini belum terhubung ke Supabase sehingga fitur masuk belum tersedia. Kamu tetap dapat menjelajahi papan proyek.", "This site is not connected to Supabase yet, so sign-in is unavailable. You can still browse the board.")}
            </p>
          ) : email ? (
            <>
              <SignInForm next={next} />
              <p className="signin-simple-alt">
                <Link href={next === "/" ? "/signin" : `/signin?next=${encodeURIComponent(next)}`}>
                  {tx(locale, "← Masuk dengan GitHub atau Google", "← Sign in with GitHub or Google")}
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="auth-form">
                <ProviderButton provider="github" next={next} />
              </div>
              <details className="signin-other" open={otherOpen}>
                <summary>{tx(locale, "Cara lain untuk masuk", "Other ways to sign in")}</summary>
                <div className="auth-form">
                  <ProviderButton provider="google" next={next} />
                </div>
              </details>
            </>
          )}

          <p className="signin-privacy">
            {tx(
              locale,
              "Kami hanya menerima nama, email, dan username atau foto profilmu—tidak bisa menyentuh kode atau repo-mu. ",
              "We only receive your name, email, and username or profile photo—nothing that can touch your code or repositories. ",
            )}
            <Link href="/privacy">{tx(locale, "Kebijakan Privasi", "Privacy Policy")}</Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
