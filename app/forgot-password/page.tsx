import type { Metadata } from "next";
import Link from "@/app/components/responsive-link";
import { SiteFooter, SiteHeader } from "../components/shell";
import { waAdminUrl } from "../content";
import { currentLocale } from "../lib/locale-server";
import { tx } from "../lib/locale";
import { site } from "../lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  return {
    title: tx(locale, `Lupa kata sandi — ${site.name}`, `Forgot password — ${site.name}`),
    description: tx(locale, `Masuk ke ${site.name} dengan GitHub atau Google.`, `Sign in to ${site.name} with GitHub or Google.`),
    robots: { index: false },
  };
}

/**
 * Kept so old links land somewhere, but there is no reset any more: it needs
 * email the site does not send, and password sign-in is being retired (#211).
 * Signing in with Google under the same email reaches the same account.
 */
export default async function ForgotPasswordPage() {
  const locale = await currentLocale();
  return (
    <>
      <SiteHeader returnTo="/forgot-password" />

      <main id="main-content" className="page-narrow auth-page">
        <h1>{tx(locale, "Kata sandi tidak dipakai lagi.", "Passwords are no longer used.")}</h1>
        <p className="lede">
          {tx(
            locale,
            "Masuk dengan GitHub atau Google. Kalau akun lamamu memakai email Gmail, masuk dengan Google memakai email yang sama—akunnya tetap akun yang sama.",
            "Sign in with GitHub or Google. If your older account uses a Gmail address, sign in with Google under the same email—it is the same account.",
          )}
        </p>
        <p className="auth-switch">
          <Link href="/signin">{tx(locale, "Masuk", "Sign in")}</Link>
          {" · "}
          <a href={waAdminUrl(`Halo Admin SWE Growth, saya tidak bisa masuk ke akun ${site.name} saya.`)} target="_blank" rel="noopener noreferrer">
            {tx(locale, "Tanya admin", "Ask the admin")}
          </a>
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
