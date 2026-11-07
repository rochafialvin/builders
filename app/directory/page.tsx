import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "@/app/components/responsive-link";
import { contribReadyUrl, shareCard, waCommunityUrl } from "../content";
import { SiteFooter, SiteHeader } from "../components/shell";
import { Skeleton } from "../components/skeleton";
import { DirectoryView } from "../components/directory-view";
import { ActivityBanner } from "../components/activity-banner";
import { pathFor, readFilters } from "../lib/directory-url";
import { readDirectory } from "../lib/directory-read";
import { currentLocale } from "../lib/locale-server";
import { currentViewer } from "../lib/session";
import { tx, type Locale } from "../lib/locale";
import { isOss, site } from "../lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await currentLocale();
  const title = isOss
    ? tx(locale, `Direktori — ${site.name}`, `Directory — ${site.name}`)
    : tx(locale, "Direktori produk — Builders", "Product directory — Builders");
  const description = isOss
    ? tx(
        locale,
        "Repo open source rekomendasi dan kurasi komunitas swegrowth, yang bagus buat mulai kontribusi. Pilih satu, kirim PR, biar kelihatan.",
        "Open source repos recommended and curated by the swegrowth community, good places to start contributing. Pick one, send a PR, let it be seen.",
      )
    : tx(
        locale,
        "Produk buatan member komunitas swegrowth, dari ide sampai rilis. Ikuti progresnya, bantu lewat peranmu, atau daftarkan produkmu.",
        "Products built by swegrowth community members, from idea to launch. Follow their progress, help in your role, or list your own.",
      );
  return { title, description, alternates: { canonical: "/directory" }, openGraph: shareCard({ title, description, url: "/directory" }) };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The directory, read like an index rather than a landing page.
 *
 * A sidebar of facets with their counts on the left — how you contribute,
 * where the project comes from, and its language or the role it wants — and a
 * dense table on the right: one row per project, the same columns down the
 * page, the button that starts the work always at the end of the row.
 */
export default async function Directory({ searchParams }: { searchParams?: SearchParams }) {
  const query = searchParams ?? Promise.resolve({});
  const locale = await currentLocale();

  return (
    <>
      <SiteHeader returnTo={query.then((value) => pathFor(readFilters(value)))} active="directory" />

      <main id="main-content" className="dx-page">
        <Suspense fallback={null}>
          <ActivityBanner locale={locale} />
        </Suspense>

        <header className="dx-head">
          <div>
            <h1>{isOss ? tx(locale, "Direktori", "Directory") : tx(locale, "Direktori produk", "Product directory")}</h1>
            <p className="dx-head-community">
              {/* What the place is for, in one line, for somebody who has just landed. */}
              {isOss
                ? tx(
                    locale,
                    "Repo open source kurasi komunitas, dari proyek member sampai repo global. Cari lebih banyak? Cek ",
                    "Open source repos curated by the community, from members' projects to global repos. Want more? See ",
                  )
                : null}
              {isOss ? (
                <a href={contribReadyUrl} target="_blank" rel="noopener noreferrer">
                  ContribReady <span aria-hidden="true">↗</span>
                </a>
              ) : (
                tx(
                    locale,
                    "Produk buatan member komunitas swegrowth, dari ide sampai rilis. Ikuti progresnya, bantu lewat peranmu, atau daftarkan produkmu.",
                    "Products built by swegrowth community members, from idea to launch. Follow their progress, help in your role, or list your own.",
                  )
              )}
            </p>
            <div className="dx-head-actions">
              {/* The open source directory asks for repos, the same for anyone,
                  so it renders with the page instead of waiting on who is
                  looking; joining is the landing page's ask, a quiet link here.
                  Builders' ask depends on the visitor and streams in. */}
              {isOss ? (
                <>
                  <Link className="primary-action" href="/recommend">
                    <span aria-hidden="true">+</span> {tx(locale, "Usulkan repo", "Suggest a repo")}
                  </Link>
                  <Link className="dx-wa-link" href="/community">
                    {tx(locale, "atau kenalan dengan komunitas", "or meet the community")}
                  </Link>
                </>
              ) : (
                <Suspense fallback={<WaButton />}>
                  <JoinCta locale={locale} />
                </Suspense>
              )}
            </div>
          </div>
          <Suspense fallback={null}>
            <HeadStats locale={locale} />
          </Suspense>
        </header>

        <Suspense fallback={<DirectorySkeleton />}>
          <DirectoryBody query={query} locale={locale} />
        </Suspense>
      </main>

      <SiteFooter />
    </>
  );
}

/**
 * The heading's call to action: a guest is asked to join, with the WA group
 * beside it as a plain link; a member is pointed at the community's chat.
 * Showing GitHub activity is asked for by `ActivityBanner` instead, which a
 * member can close.
 */
async function JoinCta({ locale }: { locale: Locale }) {
  const viewer = await currentViewer();
  if (viewer) return <WaButton />;

  return (
    <>
      <Link className="primary-action" href="/signin">
        {tx(locale, `Gabung ke ${site.name}`, `Join ${site.name}`)}
      </Link>
      {waCommunityUrl ? (
        <a className="dx-wa-link" href={waCommunityUrl} target="_blank" rel="noopener noreferrer">
          {tx(locale, "atau gabung WA Community", "or join the WA Community")}
        </a>
      ) : null}
    </>
  );
}

function WaButton() {
  if (!waCommunityUrl) return null;
  return (
    <a className="dx-wa-cta" href={waCommunityUrl} target="_blank" rel="noopener noreferrer">
      <svg className="dx-wa-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
      Join WA Community
    </a>
  );
}

/** The directory in three numbers, beside the heading on a wide screen. */
async function HeadStats({ locale }: { locale: Locale }) {
  const { entries, members } = await readDirectory(locale);
  const stats = [
    ...(isOss
      ? [{ value: entries.length, label: tx(locale, "Repo", "Repos") }]
      : [
          { value: entries.length, label: tx(locale, "Produk", "Products") },
          { value: entries.filter((entry) => entry.hasOpenRoles).length, label: tx(locale, "Cari bantuan", "Looking for help") },
        ]),
    { value: members.length, label: tx(locale, "Terdaftar", "Registered") },
  ];
  return (
    <dl className="dx-head-stats">
      {stats.map((stat) => (
        <div key={stat.label}>
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

async function DirectoryBody({ query, locale }: { query: SearchParams; locale: Locale }) {
  // Waiting for the request keeps the list in the server's first answer,
  // filtered as the address asks; from then on it filters in the browser.
  await query;
  const { entries, unavailable } = await readDirectory(locale);
  return <DirectoryView entries={entries} locale={locale} unavailable={unavailable} />;
}

function DirectorySkeleton() {
  return (
    <div className="dx-layout" aria-busy="true">
      <div className="dx-side">
        <Skeleton height={220} style={{ borderRadius: 8 }} />
      </div>
      <div className="dx-results">
        <Skeleton height={40} style={{ borderRadius: 8, marginBottom: 14 }} />
        {[0, 1, 2, 3, 4, 5].map((slot) => <Skeleton key={slot} height={78} style={{ borderRadius: 0, marginBottom: 1 }} />)}
      </div>
    </div>
  );
}
