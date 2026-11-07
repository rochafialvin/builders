import { Suspense } from "react";
import { cacheLife } from "next/cache";
import Link from "@/app/components/responsive-link";
import { Logo } from "../logo";
import { signOut } from "../auth-actions";
import { signInPath } from "../lib/urls";
import { currentViewer, type Viewer } from "../lib/session";
import { countIncomingApplications, countUnseenNotices, isSiteAdmin, listRepoSignals } from "../lib/data";
import { sourceRepo } from "../content";
import { readPublicly } from "../lib/public-read";
import { GitHubMark } from "./github-mark";
import { HeaderMenu } from "./header-menu";
import { ThemeToggle } from "./theme-toggle";
import { SignOutButton } from "./sign-out-button";
import { Skeleton } from "./skeleton";
import { HeaderIcon, type HeaderIconName } from "./header-icon";
import { BottomNav } from "./bottom-nav";
import { currentLocale } from "../lib/locale-server";
import { tx, type Locale } from "../lib/locale";
import { isOss, site } from "../lib/site";

/**
 * What "add" means on this site: listing a project on builders, suggesting an
 * open source repo on oss, which has no products to list.
 */
const ADD_HREF = isOss ? "/recommend" : "/new";
function addLabel(locale: Locale): string {
  return isOss ? tx(locale, "Usulkan repo", "Suggest a repo") : tx(locale, "Tambah project", "Add a project");
}

/** Which top-level section the current page belongs to. */
export type Section = "directory" | "leaderboard" | "recommend" | "admin" | "activity" | "how" | "about" | "community" | "feedback" | "";

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <span className={`arrow ${diagonal ? "arrow-diagonal" : ""}`} aria-hidden="true">
      →
    </span>
  );
}

export function Brand({ footer = false, locale }: { footer?: boolean; locale: Locale }) {
  return (
    <Link className={`brand ${footer ? "footer-brand" : ""}`} href="/" aria-label={tx(locale, `Beranda ${site.name}`, `${site.name} home`)}>
      <Logo className="brand-mark" />
      {/* The header keeps the name short beside the menu; the footer credits the community in full. */}
      <span><strong>{site.id}</strong>{footer ? <span className="brand-alt">.swegrowth</span> : null}</span>
    </Link>
  );
}

type NavLink = { href: string; label: string; labelId: string; key: Section; icon: HeaderIconName };

/*
 * The main menu.
 *
 * The people come first: what members are doing — pull requests on the open
 * source site, products on builders — is the home page and the first place
 * in the menu, and on a phone the bottom bar. The directory comes second, as
 * what it is: on the open source site, repos we think are good places to
 * start, not a complete catalogue. Adding to it is the header's one button.
 * The open source site's leaderboard sits between them: the home page shows
 * its first rows, and the whole season is one tap away.
 */
const PRIMARY_LINKS: NavLink[] = [
  { href: "/", label: "Activity", labelId: "Aktivitas", key: "activity", icon: isOss ? "pull-request" : "pulse" },
  ...(isOss ? [{ href: "/leaderboard", label: "Leaderboard", labelId: "Leaderboard", key: "leaderboard", icon: "trophy" } satisfies NavLink] : []),
  { href: "/directory", label: "Directory", labelId: "Direktori", key: "directory", icon: "directory" },
];

/* The pages that answer for the site — how it works, what this is, and where to say it is broken. */
const SECONDARY_LINKS: NavLink[] = [
  { href: "/how-it-works", label: "How it works", labelId: "Cara kerja", key: "how", icon: "steps" },
  { href: "/about", label: "About", labelId: "Tentang", key: "about", icon: "about" },
  { href: "/feedback", label: "Feedback", labelId: "Masukan", key: "feedback", icon: "feedback" },
];

/*
 * The WhatsApp group and its rules. Not in the laptop's header, which is full;
 * the phone's menu, the footer and /about lead to it.
 */
const COMMUNITY_LINK: NavLink = { href: "/community", label: "Community", labelId: "Komunitas", key: "community", icon: "community" };


function MainNav({ active, locale }: { active: Section; locale: Locale }) {
  return (
    <nav className="desktop-nav" aria-label={tx(locale, "Navigasi utama", "Primary navigation")}>
      {[...PRIMARY_LINKS, ...SECONDARY_LINKS].map((link) => (
        <Link
          key={link.href}
          aria-current={active === link.key ? "page" : undefined}
          className={[active === link.key ? "is-active" : "", SECONDARY_LINKS.includes(link) ? "nav-secondary" : ""].filter(Boolean).join(" ")}
          href={link.href}
        >
          {tx(locale, link.labelId, link.label)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The phone's bottom bar, rendered once in the root layout rather than in
 * each page's header: it stays put while a page loads, so it neither blinks
 * through the loading skeleton nor loses its third tab on every navigation.
 * The visitor streams in once; until then the third place is a placeholder.
 */
export async function SiteBottomNav() {
  const locale = await currentLocale();
  return (
    <Suspense fallback={<BottomNav links={bottomLinks(locale)} account={undefined} label={bottomLabel(locale)} />}>
      <ViewerBottomNav locale={locale} />
    </Suspense>
  );
}

async function ViewerBottomNav({ locale }: { locale: Locale }) {
  const viewer = await currentViewer();
  return (
    <BottomNav
      links={bottomLinks(locale)}
      label={bottomLabel(locale)}
      account={
        viewer
          ? { kind: "profile", username: viewer.username, label: tx(locale, "Profil", "Profile") }
          : { kind: "signin", label: tx(locale, "Masuk", "Sign in") }
      }
    />
  );
}

function bottomLinks(locale: Locale) {
  return PRIMARY_LINKS.map((link) => ({ href: link.href, label: tx(locale, link.labelId, link.label), icon: link.icon }));
}

function bottomLabel(locale: Locale): string {
  return tx(locale, "Navigasi utama seluler", "Mobile primary navigation");
}

/**
 * This site's own repository, with its stars — the site is open source, and
 * says so where open source sites usually do. The count comes from the same
 * cached repo_signals the directory reads, so it costs no GitHub request; it
 * stays small and light beside the mark, and on a phone the mark stands alone.
 */
async function SourceLink({ locale }: { locale: Locale }) {
  const signals = await readPublicly("source stars in header", () => listRepoSignals(), {});
  const stars = signals.value[sourceRepo.toLowerCase()]?.stats?.stars ?? 0;
  const count = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", { notation: "compact", maximumFractionDigits: 1 }).format(stars);
  const label = stars > 0
    ? tx(locale, `Kode sumber di GitHub, ${stars} bintang`, `Source code on GitHub, ${stars} stars`)
    : tx(locale, "Kode sumber di GitHub", "Source code on GitHub");
  return (
    <a className="source-link" href={`https://github.com/${sourceRepo}`} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
      <GitHubMark />
      {stars > 0 ? <span className="source-link-count" aria-hidden="true">{count}</span> : null}
    </a>
  );
}

/**
 * The header's static frame — same brand and links, no visitor yet.
 *
 * Every loading.tsx renders this so a navigation answers instantly with the
 * page's skeleton instead of a blank strip where the header will be. The real
 * SiteHeader streams in over it once the visitor is known.
 */
export async function HeaderShell({ active = "" }: { active?: Section }) {
  const locale = await currentLocale();
  return (
    <>
      <header className="site-header">
        <div className="topbar-inner">
          <Brand locale={locale} />
          <MainNav active={active} locale={locale} />
          <div className="header-actions header-shell-actions header-account-skeleton" aria-busy="true">
            <SourceLink locale={locale} />
            <Skeleton height={36} width={36} round />
            <Skeleton height={32} width={150} style={{ borderRadius: 6 }} />
            <span className="sr-only">{tx(locale, "Memuat kontrol akun…", "Loading account controls…")}</span>
          </div>
        </div>
      </header>
    </>
  );
}

/**
 * The header, with the visitor streamed in.
 *
 * Who is looking is the one thing on most pages that cannot be cached or
 * prerendered — it comes from a cookie and a round trip to the auth server.
 * Holding the whole page open for it would make every route dynamic, which is
 * exactly what this site used to do. Behind this boundary the rest of the page
 * prerenders and ships immediately, and the header fills itself in.
 *
 * `HeaderShell` deliberately uses neutral placeholders for account controls.
 * Until the session resolves, we do not know whether the visitor should see a
 * sign-in link or an account menu, and rendering either would flash the wrong
 * state.
 */
export async function SiteHeader({
  returnTo = "/",
  active = "",
}: {
  returnTo?: string | Promise<string>;
  active?: Section;
}) {
  const locale = await currentLocale();
  return (
    <Suspense fallback={<HeaderShell active={active} />}>
      <VisitorHeader returnTo={returnTo} active={active} locale={locale} />
    </Suspense>
  );
}

async function VisitorHeader({
  returnTo = "/",
  active = "",
  locale,
}: {
  returnTo?: string | Promise<string>;
  active?: Section;
  locale: Locale;
}) {
  // `returnTo` may be a promise: on the pages whose address depends on the
  // filters in the URL, working it out means reading `searchParams`. Awaiting
  // it here rather than in the page keeps that read inside this boundary,
  // where the visitor is already being waited for, instead of holding up the
  // page's prerendered shell.
  const [viewer, destination] = await Promise.all([currentViewer(), returnTo]);
  // An application nobody sees is an application nobody answers, and a
  // decision nobody sees is the same — so both counts ride along in the header
  // rather than waiting to be found.
  const [incomingResult, unseenResult, adminResult] = viewer
    ? await Promise.all([
        readPublicly("incoming applications in header", () => countIncomingApplications(viewer.id), 0),
        readPublicly("notifications in header", () => countUnseenNotices(viewer.id), 0),
        readPublicly("admin check in header", () => isSiteAdmin(), false),
      ])
    : [
        { value: 0, unavailable: false },
        { value: 0, unavailable: false },
        { value: false, unavailable: false },
      ];
  const admin = adminResult.value;
  const incoming = incomingResult.value;
  const unseen = unseenResult.value;
  const waiting = incoming + unseen;

  return (
    <>
      <header className="site-header">
        <div className="topbar-inner">
          <Brand locale={locale} />
          <MainNav active={active} locale={locale} />

          <div className="header-actions">
            <SourceLink locale={locale} />
            {viewer ? (
              <>
                {/* No proposals or notices on the open source site. */}
                {isOss ? null : (
                  <Link className="icon-button" href="/inbox" aria-label={inboxLabel(incoming, unseen, locale)}>
                    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 21h4" />
                    </svg>
                    {waiting > 0 ? <span className="notification-dot">{waiting}</span> : null}
                  </Link>
                )}
                <AccountMenu viewer={viewer} waiting={waiting} admin={admin} locale={locale} />
                <Link className="primary-action" href={ADD_HREF}>
                  <span aria-hidden="true">+</span> {addLabel(locale)}
                </Link>
              </>
            ) : (
              <>
                <Link className="nav-login" href={signInPath(destination)}>{tx(locale, "Masuk", "Sign in")}</Link>
                {/* A guest's first step is an account, whatever they came for: suggesting a
                    project needs one too. A plain sign-in lands on /get-started. */}
                <Link className="primary-action" href="/signin">
                  {tx(locale, "Gabung", "Join")}
                </Link>
              </>
            )}

            <MobileHeaderMenu active={active} returnTo={destination} viewer={viewer} waiting={waiting} admin={admin} locale={locale} />
          </div>
        </div>
      </header>
    </>
  );
}

function AccountIdentity({ viewer }: { viewer: Viewer }) {
  return (
    <div className="account-identity">
      <span className="account-avatar" aria-hidden="true">{initialsOf(viewer.name)}</span>
      <span className="account-identity-copy">
        <strong>{viewer.name}</strong>
        <span>@{viewer.username}</span>
        {viewer.profession ? <small>{viewer.profession}</small> : null}
      </span>
    </div>
  );
}

function AccountMenu({ viewer, waiting, admin, locale }: { viewer: Viewer; waiting: number; admin: boolean; locale: Locale }) {
  return (
    <HeaderMenu
      className="account-menu"
      summaryClassName="avatar-button"
      summaryLabel={tx(locale, `Buka menu akun ${viewer.name}`, `Open ${viewer.name}'s account menu`)}
      summary={<span aria-hidden="true">{initialsOf(viewer.name)}</span>}
    >
      <div className="account-popover">
        <AccountIdentity viewer={viewer} />
        <nav className="account-menu-links" aria-label={tx(locale, "Menu akun", "Account menu")}>
          <Link href={`/u/${viewer.username}`}>
            <HeaderIcon name="profile" />
            <span>{tx(locale, "Profil publik", "Public profile")}</span>
          </Link>
          <Link href="/account/profile">
            <HeaderIcon name="edit" />
            <span>{tx(locale, "Edit profil", "Edit profile")}</span>
          </Link>
          <Link href="/get-started?all=1">
            <HeaderIcon name="steps" />
            <span>{tx(locale, "Langkah berikutnya", "Next steps")}</span>
          </Link>
          {isOss ? null : (
            <Link href="/inbox">
              <HeaderIcon name="inbox" />
              <span>{tx(locale, "Kotak masuk", "Inbox")}</span>
              {waiting > 0 ? <span className="menu-count">{waiting}</span> : null}
            </Link>
          )}
          <Link href={ADD_HREF}>
            <HeaderIcon name="add" />
            <span>{addLabel(locale)}</span>
          </Link>
          <Link href="/account/language">
            <HeaderIcon name="language" />
            <span>{tx(locale, "Bahasa", "Language")}</span>
          </Link>
          {admin ? (
            <Link href="/admin">
              <HeaderIcon name="steps" />
              <span>Admin</span>
            </Link>
          ) : null}
        </nav>
        <div className="menu-theme-row"><ThemeToggle row /></div>
        <form className="account-signout" action={signOut}>
          <SignOutButton />
        </form>
      </div>
    </HeaderMenu>
  );
}

function MobileHeaderMenu({
  active,
  returnTo,
  viewer,
  waiting,
  admin,
  locale,
}: {
  active: Section;
  returnTo: string;
  viewer?: Viewer | null;
  waiting: number;
  admin: boolean;
  locale: Locale;
}) {
  return (
    <HeaderMenu
      className="mobile-menu"
      summaryLabel={tx(locale, "Buka menu navigasi", "Open navigation menu")}
      summary={
        <>
          <i aria-hidden="true" />
          <i aria-hidden="true" />
        </>
      }
    >
      <div className="mobile-nav">
        {/* Directory, activity and the profile are on the bottom bar; the menu
            keeps only what is not, so it stays short enough for one screen. */}
        {viewer ? (
          <section className="mobile-account-section" aria-label={tx(locale, "Akun", "Account")}>
            <Link className="mobile-account-identity" href={`/u/${viewer.username}`}>
              <AccountIdentity viewer={viewer} />
            </Link>
            <nav className="mobile-account-links" aria-label={tx(locale, "Menu akun seluler", "Mobile account menu")}>
              <Link href="/account/profile">
                <HeaderIcon name="edit" />
                <span>{tx(locale, "Edit profil", "Edit profile")}</span>
              </Link>
              {isOss ? null : (
                <Link href="/inbox">
                  <HeaderIcon name="inbox" />
                  <span>{tx(locale, "Kotak masuk", "Inbox")}</span>
                  {waiting > 0 ? <span className="menu-count">{waiting}</span> : null}
                </Link>
              )}
              <Link href="/get-started?all=1">
                <HeaderIcon name="steps" />
                <span>{tx(locale, "Langkah berikutnya", "Next steps")}</span>
              </Link>
              {admin ? (
                <Link href="/admin">
                  <HeaderIcon name="steps" />
                  <span>Admin</span>
                </Link>
              ) : null}
            </nav>
          </section>
        ) : null}

        {viewer ? (
          <Link className="mobile-project-action" href={ADD_HREF}>
            <HeaderIcon name="add" />
            <span>{addLabel(locale)}</span>
          </Link>
        ) : (
          <Link className="mobile-project-action" href="/signin">
            <HeaderIcon name="profile" />
            <span>{tx(locale, `Gabung ke ${site.name}`, `Join ${site.name}`)}</span>
          </Link>
        )}

        <nav className="mobile-nav-pages" aria-label={tx(locale, "Menu seluler", "Mobile menu")}>
          {[COMMUNITY_LINK, ...SECONDARY_LINKS].map((link) => (
            <Link
              key={link.href}
              aria-current={active === link.key ? "page" : undefined}
              className={active === link.key ? "is-active" : ""}
              href={link.href}
            >
              <HeaderIcon name={link.icon} />
              <span>{tx(locale, link.labelId, link.label)}</span>
            </Link>
          ))}
        </nav>

        <div className="mobile-nav-settings">
          <Link href="/account/language">
            <HeaderIcon name="language" />
            <span>{tx(locale, "Bahasa", "Language")}</span>
          </Link>
          <ThemeToggle row />
          {viewer ? (
            <form className="account-signout" action={signOut}>
              <SignOutButton />
            </form>
          ) : (
            <Link href={signInPath(returnTo)}>
              <HeaderIcon name="signin" />
              <span>{tx(locale, "Masuk", "Sign in")}</span>
            </Link>
          )}
        </div>
      </div>
    </HeaderMenu>
  );
}

/** One badge, two meanings — the label says which, rather than just a number. */
function inboxLabel(incoming: number, unseen: number, locale: Locale): string {
  const parts = [
    incoming > 0 ? tx(locale, `${incoming} orang menunggu tanggapan`, `${incoming} people awaiting a response`) : "",
    unseen > 0 ? tx(locale, `${unseen} kabar baru`, `${unseen} new updates`) : "",
  ].filter(Boolean);

  return parts.length > 0
    ? `${tx(locale, "Kotak masuk", "Inbox")} — ${parts.join(", ")}`
    : tx(locale, "Kotak masuk", "Inbox");
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function SiteFooter() {
  const locale = await currentLocale();
  return (
    <footer>
      <div className="footer-brand-group">
        <Brand footer locale={locale} />
        <p>
          {isOss
            ? tx(locale, "Direktori repo open source yang bisa kamu kontribusikan.", "A directory of open source repos you can contribute to.")
            : tx(locale, "Direktori produk buatan member komunitas swegrowth.", "A directory of products built by swegrowth community members.")}
        </p>
      </div>
      {/* Only the pages the header leaves out: the directory, adding to it and
          GitHub are a click away up there already. */}
      <nav aria-label={tx(locale, "Navigasi footer", "Footer navigation")}>
        <Link href="/how-it-works">{tx(locale, "Cara kerjanya", "How it works")}</Link>
        <Link href="/about">{tx(locale, "Tentang Kami", "About Us")}</Link>
        <Link href="/community">{tx(locale, "Komunitas", "Community")}</Link>
        <Link href="/feedback">{tx(locale, "Masukan", "Feedback")}</Link>
        <Link href="/privacy">{tx(locale, "Privasi", "Privacy")}</Link>
      </nav>
      <div className="footer-end">
        {/* A signed-out visitor on a laptop has no account menu, so language
            and theme stay here for them, apart from the pages. */}
        <div className="footer-prefs">
          <Link href="/account/language">{tx(locale, "Bahasa", "Language")}</Link>
          <ThemeToggle row />
        </div>
        <small>© <CopyrightYear /> {site.name}</small>
      </div>
    </footer>
  );
}

/**
 * The year in the footer, cached.
 *
 * `new Date()` cannot be read while prerendering — it would freeze whatever
 * the build machine's clock said into the static shell. Caching it is the
 * honest fix: the year is the same for everybody, and re-reading it once a day
 * means the footer turns over within a day of New Year without any page here
 * having to be rendered per request to say so.
 */
async function CopyrightYear() {
  "use cache";
  cacheLife("days");

  return new Date().getFullYear();
}
