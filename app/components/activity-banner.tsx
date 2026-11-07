import { cookies } from "next/headers";
import Link from "./responsive-link";
import { DismissibleBanner } from "./dismissible-banner";
import { currentViewer } from "../lib/session";
import { tx, type Locale } from "../lib/locale";
import { isOss } from "../lib/site";

const ACTIVITY_BANNER_COOKIE = "builders_activity_banner_closed";

/**
 * A member whose GitHub activity is not shown yet is reminded at the top of
 * the directory and of /activity: the loop the site runs on (see
 * /how-it-works) only counts merged PRs it can see. A banner rather than a
 * button, so somebody who has decided not to can close it — on both pages at
 * once, for a month at a time.
 */
export async function ActivityBanner({ locale }: { locale: Locale }) {
  // GitHub activity is the open source site's; the builders site shows none of it.
  if (!isOss) return null;
  const [viewer, cookieStore] = await Promise.all([currentViewer(), cookies()]);
  if (!viewer || (viewer.github && viewer.githubActivityShown)) return null;
  if (cookieStore.get(ACTIVITY_BANNER_COOKIE)?.value === "1") return null;

  return (
    <DismissibleBanner cookie={ACTIVITY_BANNER_COOKIE} closeLabel={tx(locale, "Tutup pengingat", "Close the reminder")}>
      <strong>{tx(locale, "Aktivitas GitHub-mu belum tampil.", "Your GitHub activity is not shown yet.")}</strong>{" "}
      {viewer.github
        ? tx(
            locale,
            "Nyalakan biar PR-mu yang di-merge muncul di halaman Aktivitas dan profilmu.",
            "Turn it on so your merged PRs show on the Activity page and your profile.",
          )
        : tx(
            locale,
            "Tautkan akun GitHub-mu biar PR-mu yang di-merge muncul di halaman Aktivitas dan profilmu.",
            "Link your GitHub account so your merged PRs show on the Activity page and your profile.",
          )}{" "}
      <Link href="/account/profile#github-account">
        {viewer.github ? tx(locale, "Tampilkan sekarang", "Show it now") : tx(locale, "Tautkan GitHub", "Link GitHub")}
      </Link>
    </DismissibleBanner>
  );
}

