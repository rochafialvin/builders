import { BADGE_KINDS, PRODUCT_BADGES, type Badge, type BadgeKind } from "./badges";
import { memberBadges, mergeBadges, type OssMember } from "./oss";
import type { GitHubRepositoryStats } from "./github";
import { parseGitHubRepositoryUrl } from "./github";
import { tx, type Locale } from "./locale";
import { isHttpUrl } from "./brief";
import { STAGES, type Stage } from "./stages";
import { isOss } from "./site";
import {
  reasonLabel,
  repoBadges,
  repoUrl,
  starterIssuesUrl,
  type OpenSourceRepo,
} from "./open-source";

/**
 * The directory: every project somebody can contribute to, in one list.
 *
 * Split by *how* you contribute, because that is the first thing somebody
 * decides and the two paths do not overlap:
 *
 *   - `github` — code, through a pull request on GitHub. Open source we
 *     maintain, open source we recommend, and builders' products that take PRs.
 *   - `role` — joining a builders' product in a named role (design, product,
 *     research, content, engineering…), asked for and answered on this site.
 *
 * A product that does both is listed once on each path, with the action that
 * path needs, and each entry says whether it also takes the other kind of help.
 * `source` says whether the maintainers are here — one of us, so somebody you
 * can reach — or a repository from outside that one of us recommends.
 *
 * Pure, so the unit tests read it directly.
 */
export const DIRECTORY_TRACKS = ["github", "role"] as const;
export type DirectoryTrack = (typeof DIRECTORY_TRACKS)[number];

export function isDirectoryTrack(value: string): value is DirectoryTrack {
  return (DIRECTORY_TRACKS as readonly string[]).includes(value);
}

export const DIRECTORY_SOURCES = ["community", "recommended"] as const;
export type DirectorySource = (typeof DIRECTORY_SOURCES)[number];

export function isDirectorySource(value: string): value is DirectorySource {
  return (DIRECTORY_SOURCES as readonly string[]).includes(value);
}

export type DirectoryEntry = {
  key: string;
  /** A catalogue repository, or a product listed on this site. */
  kind: "repo" | "product";
  track: DirectoryTrack;
  source: DirectorySource;
  name: string;
  /** Who it belongs to: a GitHub owner, or the founder's name. */
  owner: string;
  /** An image for the tile: the product's logo, or the repo owner's avatar. */
  logoUrl: string;
  /** The product's website, whose favicon stands in when there is no logo. */
  website: string;
  /** Where else it lives — its repository and its website — each with an icon. */
  links: DirectoryLink[];
  description: string;
  /** A catalogue repo's reason for being listed, in its submitter's words. */
  why?: string;
  /** Who put a catalogue repo forward. */
  submittedBy?: { username: string; name: string } | null;
  /** The same person, with how they stand to the repo — what the card credits. */
  sharedBy?: SharedBy | null;
  /** Why a repo is listed, or the roles a product is asking for. */
  labels: string[];
  /**
   * Where it stands on pull requests — see `PRTier`. The one thing a code-path
   * visitor most wants to know, so it sits next to the name, not among tags.
   * Null for a product with no GitHub repository.
   */
  prTier: PRTier | null;
  /** Shorthand for `takesPRs(prTier)`. */
  welcomesPRs: boolean;
  /** It is asking for people in named roles — design, product, research… */
  hasOpenRoles: boolean;
  /** Hand-set trust signals about the people around it — see `badges.ts`. */
  badges: Badge[];
  language: string;
  stars: number | null;
  /** When GitHub last saw a push — the card's "Last push …". Null when unknown. */
  updatedAt: string | null;
  /** When it joined the directory: its catalogue row, or the product. Null when unknown. */
  listedAt: string | null;
  /**
   * A product's last sign of life here — an update, a comment, a seat filled.
   * What a role card dates itself by, since a product may have no repository
   * to push to. Null for a catalogue repo.
   */
  activeAt: string | null;
  /** A product's stage. Null for a catalogue repo. */
  stage: Stage | null;
  /** How many seats a product has open; 0 for a catalogue repo. */
  openSeats: number;
  /** A site admin put it first. */
  adminPick: boolean;
  /** Its GitHub repository as `owner/name`, lower-cased — what the Star button stars. Null without one. */
  repo: string | null;
  /** Where the name links — the repo, or the product's page here. */
  href: string;
  /** The one action that matters on this path. */
  actionHref: string;
  actionLabel: string;
  /** What the button opens, so the table can label it in one short word. */
  actionKind: "issues" | "repo" | "roles";
  /** True when `actionHref` leaves this site. */
  external: boolean;
};

/**
 * Who put a catalogue repository forward, and how they stand to it. The
 * person sharing a repo is not always its owner, and the card says which:
 *
 *   - `owner`       — their GitHub username owns the repository;
 *   - `maintainer`  — their open source record says they maintain it;
 *   - `contributor` — they have contributed to it, by their record or GitHub's;
 *   - `recommender` — none of the above: somebody else's work they vouch for.
 */
export const SHARED_BY_ROLES = ["owner", "maintainer", "contributor", "recommender"] as const;
export type SharedByRole = (typeof SHARED_BY_ROLES)[number];
export type SharedBy = { username: string; name: string; role: SharedByRole };

export function sharedBy(
  repo: string,
  submitter: { username: string; name: string } | null | undefined,
  members: OssMember[] = [],
): SharedBy | null {
  if (!submitter) return null;
  const key = repo.toLowerCase();
  const member = members.find((candidate) => candidate.username === submitter.username);
  const record = member?.contributions.find((contribution) => contribution.repo === key);
  const role: SharedByRole =
    member?.handle && member.handle.toLowerCase() === key.split("/")[0]
      ? "owner"
      : record?.relation === "maintainer"
        ? "maintainer"
        : record
          ? "contributor"
          : "recommender";
  return { ...submitter, role };
}

export type DirectoryLink = { kind: "github" | "website"; href: string; label: string };

/**
 * A listed repository's page here: `/directory/owner/name`, in lower case like
 * every repo key on the site, so one repo has one address however it is typed.
 */
export function repoPagePath(repo: string): string {
  return `/directory/${repo.toLowerCase()}`;
}

/**
 * How far a repository is from merging somebody's first pull request, measured
 * on GitHub rather than taken from a checkbox — a box ticked five years ago on
 * a repository nobody has touched since is not an invitation.
 *
 *   - `active`    open, and an outsider's PR was merged in the last 90 days
 *   - `first`     open and alive, but no outsider has been merged yet
 *   - `open`      open and alive; GitHub did not say whether outsiders merge
 *   - `unopened`  the owner has not said they take pull requests
 *   - `inactive`  open, but archived or untouched for 120 days
 *
 * Listed in the order the directory shows them.
 */
export const PR_TIERS = ["active", "first", "open", "unopened", "inactive"] as const;
export type PRTier = (typeof PR_TIERS)[number];

export function isPRTier(value: string): value is PRTier {
  return (PR_TIERS as readonly string[]).includes(value);
}

/** The window an outsider's merged PR counts as evidence for. */
export const PR_EVIDENCE_DAYS = 90;
/** How long a repository may go without a push before it counts as inactive. */
export const ALIVE_DAYS = 120;

/** What GitHub said about who gets merged, and when it was asked. */
export type RepoActivity = { outsidePRs: number | null; checkedAt: number };

export function prTier(
  opened: boolean,
  stats: Pick<GitHubRepositoryStats, "pushedAt" | "archived"> | null | undefined,
  activity: RepoActivity | null | undefined,
): PRTier {
  if (!opened) return "unopened";
  if (stats?.archived) return "inactive";
  const pushed = stats?.pushedAt ? Date.parse(stats.pushedAt) : NaN;
  if (activity && Number.isFinite(pushed) && activity.checkedAt - pushed > ALIVE_DAYS * 86_400_000) return "inactive";
  if (activity?.outsidePRs == null) return "open";
  return activity.outsidePRs > 0 ? "active" : "first";
}

/** Whether a tier still invites a pull request — everything but the two at the bottom. */
export function takesPRs(tier: PRTier | null): boolean {
  return tier === "active" || tier === "first" || tier === "open";
}

export function prTierLabel(tier: PRTier, locale: Locale): string {
  if (tier === "active") return tx(locale, "Aktif menerima PR", "Actively accepting PRs");
  if (tier === "first") return tx(locale, "Cari kontributor pertama", "Looking for a first contributor");
  if (tier === "open") return tx(locale, "Menerima PR", "Accepting PRs");
  if (tier === "unopened") return tx(locale, "Belum buka PR", "Not open to PRs yet");
  return tx(locale, "Tidak aktif", "Inactive");
}

/** The slice of a Builders project the directory needs. */
export type DirectoryProduct = {
  id: number;
  slug: string;
  title: string;
  tagline: string;
  repoUrl: string;
  liveUrl?: string;
  logoUrl?: string;
  openForGitHubContributions: boolean;
  openSeatCount: number;
  openRoles: string[];
  /** Filled seats — people who have already joined and helped. */
  activeMemberCount: number;
  owner: { name: string };
  stage?: Stage;
  createdAt?: string;
  lastActivityAt?: string;
  adminPick?: boolean;
  /** GitHub's numbers for `repoUrl`, when it is a GitHub repository that answered. */
  repoStats?: GitHubRepositoryStats | null;
  /** Who gets merged on that repository. */
  repoActivity?: RepoActivity | null;
};

/**
 * A repository's entry. `members` are everybody's open source records: who
 * among us has contributed to or maintains this repo becomes its badges,
 * alongside whatever was set by hand in the catalogue.
 */
export function repoEntry(
  repo: OpenSourceRepo & { stats?: GitHubRepositoryStats | null; activity?: RepoActivity | null; adminPick?: boolean },
  locale: Locale,
  members: OssMember[] = [],
): DirectoryEntry {
  // Being in the catalogue means being put forward for contributions, so it
  // counts as opened; GitHub decides how far along it is.
  const tier = prTier(true, repo.stats, repo.activity);
  const open = takesPRs(tier);
  return {
    key: `repo:${repo.owner}/${repo.repo}`,
    kind: "repo",
    track: "github",
    // Our own repositories are listed with the products of the community:
    // either way the maintainers are people you can reach here.
    source: repo.list === "internal" ? "community" : "recommended",
    name: repo.repo,
    owner: repo.owner,
    // GitHub serves any owner's avatar at this address; it is what people
    // recognise a repository by.
    logoUrl: `https://github.com/${encodeURIComponent(repo.owner)}.png?size=80`,
    website: "",
    links: [],
    description: repo.summary,
    why: repo.why,
    submittedBy: repo.submittedBy,
    sharedBy: sharedBy(`${repo.owner}/${repo.repo}`, repo.submittedBy, members),
    labels: repo.reasons.map((reason) => reasonLabel(reason, locale)),
    prTier: tier,
    welcomesPRs: open,
    hasOpenRoles: false,
    badges: mergeBadges(
      [...pickBadge(repo.adminPick), ...repoBadges(repo)],
      memberBadges(`${repo.owner}/${repo.repo}`, members),
    ),
    language: repo.stats?.language ?? "",
    stars: repo.stats ? repo.stats.stars : null,
    updatedAt: repo.stats?.pushedAt ?? null,
    listedAt: repo.createdAt || null,
    activeAt: null,
    stage: null,
    openSeats: 0,
    adminPick: Boolean(repo.adminPick),
    repo: `${repo.owner}/${repo.repo}`.toLowerCase(),
    href: repoUrl(repo),
    actionHref: open ? starterIssuesUrl(repo) : repoUrl(repo),
    actionLabel: open ? tx(locale, "Isu pemula di GitHub", "Starter issues on GitHub") : tx(locale, "Lihat repo", "View repo"),
    actionKind: open ? "issues" : "repo",
    external: true,
  };
}

/**
 * A product's entries: one on the GitHub path when it takes pull requests on
 * a GitHub repository, one on the role path when it names roles it needs, and
 * none when it asks for nothing.
 *
 * With `everyProduct`, the builders site's directory of products: the role
 * path lists every product, asking for help or not, and the way in to one
 * that is not is its page.
 */
export function productEntries<P extends DirectoryProduct>(
  project: P,
  describe: (project: P) => string,
  roleName: (role: string) => string,
  locale: Locale,
  { everyProduct = false }: { everyProduct?: boolean } = {},
): DirectoryEntry[] {
  // Every product with a GitHub repository is on the code path, ranked by its
  // PR tier: the ones merging outsiders first, the ones not taking PRs last —
  // still findable for somebody who wants to read the code, but never
  // presented as an invitation. The tier also decides where the button goes.
  const repository = parseGitHubRepositoryUrl(project.repoUrl);
  const tier = repository ? prTier(project.openForGitHubContributions, project.repoStats, project.repoActivity) : null;
  const welcomesPRs = takesPRs(tier);
  const page = `/projects/${project.slug}`;
  const rolesHref = `${page}?tab=collaboration#help-heading`;
  const website = project.liveUrl && isHttpUrl(project.liveUrl) ? project.liveUrl : "";
  const links: DirectoryLink[] = [
    ...(repository ? [{ kind: "github" as const, href: repository.url, label: `${repository.owner}/${repository.repo}` }] : []),
    ...(website ? [{ kind: "website" as const, href: website, label: hostOf(website) }] : []),
  ];
  const base = {
    kind: "product" as const,
    source: "community" as const,
    name: project.title,
    owner: project.owner.name,
    logoUrl: productLogo(project.logoUrl ?? "", website, repository),
    website,
    links,
    prTier: tier,
    welcomesPRs,
    hasOpenRoles: project.openSeatCount > 0,
    description: describe(project),
    language: "",
    stars: null,
    updatedAt: null,
    listedAt: project.createdAt || null,
    activeAt: project.lastActivityAt || null,
    stage: project.stage ?? null,
    openSeats: project.openSeatCount,
    adminPick: Boolean(project.adminPick),
    repo: repository ? `${repository.owner}/${repository.repo}`.toLowerCase() : null,
    href: page,
    // A filled seat is somebody from here who already joined: the product's
    // own "a friend has been here", counted rather than named.
    badges: mergeBadges(
      [...pickBadge(project.adminPick), ...(PRODUCT_BADGES[project.slug] ?? [])],
      project.activeMemberCount > 0 ? [{ kind: "friend-contributed", count: project.activeMemberCount }] : [],
    ),
  };
  const entries: DirectoryEntry[] = [];

  if (repository) {
    // On the code path the repository is the thing being offered, so the row
    // reads like one: GitHub's language and stars, and the name opens the repo.
    const stats = project.repoStats ?? null;
    entries.push({
      ...base,
      key: `product:${project.id}:github`,
      track: "github",
      description: base.description || stats?.description || "",
      language: stats?.language ?? "",
      stars: stats ? stats.stars : null,
      updatedAt: stats?.pushedAt ?? null,
      href: repository.url,
      labels: [],
      actionHref: welcomesPRs ? `${repository.url}/issues` : repository.url,
      actionLabel: welcomesPRs ? tx(locale, "Isu di GitHub", "Issues on GitHub") : tx(locale, "Lihat repo", "View repo"),
      actionKind: welcomesPRs ? "issues" : "repo",
      external: true,
    });
  }
  if (project.openSeatCount > 0) {
    entries.push({
      ...base,
      key: `product:${project.id}:role`,
      track: "role",
      labels: project.openRoles.map(roleName),
      actionHref: rolesHref,
      actionLabel: tx(locale, "Lihat peran", "See the roles"),
      actionKind: "roles",
      external: false,
    });
  } else if (everyProduct) {
    entries.push({
      ...base,
      key: `product:${project.id}:role`,
      track: "role",
      labels: [],
      actionHref: page,
      actionLabel: tx(locale, "Lihat produk", "See the product"),
      actionKind: "roles",
      external: false,
    });
  }
  return entries;
}

function pickBadge(picked: boolean | undefined): Badge[] {
  return picked ? [{ kind: "admin-pick" }] : [];
}

/**
 * Narrowing by what else a project takes: pull requests, or people in roles.
 * A product can do both, so either filter makes sense on either path.
 */
export const DIRECTORY_OPENINGS = ["prs", "roles"] as const;
export type DirectoryOpening = (typeof DIRECTORY_OPENINGS)[number];

export function isDirectoryOpening(value: string): value is DirectoryOpening {
  return (DIRECTORY_OPENINGS as readonly string[]).includes(value);
}

function isOpenFor(entry: DirectoryEntry, opening: DirectoryOpening): boolean {
  return opening === "prs" ? entry.welcomesPRs : entry.hasOpenRoles;
}

/**
 * The orders a visitor can ask for. Empty is the default on both paths: the
 * newest listed first. `ready` is the code path's PR tier order, `active` the
 * role path's last activity.
 */
export const DIRECTORY_SORTS = ["ready", "active", "updated", "stars"] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export function isDirectorySort(value: string): value is DirectorySort {
  return (DIRECTORY_SORTS as readonly string[]).includes(value);
}

/**
 * The orders that mean something on a path. A role card has no push and no
 * stars, nor a PR tier.
 */
export function sortsFor(track: DirectoryTrack): DirectorySort[] {
  return track === "github" ? ["ready", "updated", "stars"] : ["active"];
}

export function sortLabel(sort: DirectorySort | "", track: DirectoryTrack, locale: Locale): string {
  if (sort === "ready") return tx(locale, "Paling siap menerima PR", "Most ready for PRs");
  if (sort === "active") return tx(locale, "Aktivitas terbaru", "Recently active");
  if (sort === "updated") return tx(locale, "Push terbaru", "Recently pushed");
  if (sort === "stars") return tx(locale, "Bintang terbanyak", "Most stars");
  return tx(locale, "Baru masuk direktori", "Newest listed");
}

export type DirectoryFilters = {
  track: DirectoryTrack;
  /** Local or global open source. Empty for both. */
  scope?: DirectoryScope | "";
  /** Only entries taking this kind of help. Empty for any. */
  open?: DirectoryOpening | "";
  /** Only entries at one of these PR tiers. Empty for any. */
  pr?: PRTier[];
  /** Only entries carrying this badge. Empty for any. */
  badge: BadgeKind | "";
  /** Languages on the GitHub path, roles on the role path; an entry with any of them. Empty for any. */
  facet: string[];
  /** Only products at one of these stages. Empty for any. */
  stage?: Stage[];
  /** Empty for the default: the newest listed first. */
  sort?: DirectorySort | "";
  q: string;
};

/** What the chips on a path filter by: a repo's language, or a role asked for. */
function facetsOf(entry: DirectoryEntry): string[] {
  return entry.track === "github" ? (entry.language ? [entry.language] : []) : entry.labels;
}

/**
 * One path, narrowed by its chips and the search box. Within a group the
 * chips widen (TypeScript or Go); across groups they narrow. Unless another
 * order is asked for, an admin's picks come first and the rest are the newest
 * listed first, on both paths.
 */
/** How many cards one page of the directory shows. */
export const PAGE_SIZE = 20;

export type DirectoryPage<T> = { items: T[]; page: number; pages: number };

/**
 * One page of `items`, counted from 1. A page past the end — an old link to a
 * list that has since shrunk — lands on the last page rather than an empty
 * one; anything that is not a whole number lands on the first.
 */
export function paginate<T>(items: T[], requested: string | number, size = PAGE_SIZE): DirectoryPage<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const asked = typeof requested === "number" ? requested : Number.parseInt(requested, 10);
  const page = Number.isInteger(asked) && asked >= 1 ? Math.min(asked, pages) : 1;
  return { items: items.slice((page - 1) * size, page * size), page, pages };
}

export function filterDirectory(entries: DirectoryEntry[], filters: DirectoryFilters): DirectoryEntry[] {
  const query = searchable(filters.q);
  const facets = filters.facet.map(searchable);
  const tiers = filters.pr ?? [];
  const stages = filters.stage ?? [];
  const matched = entries.filter((entry) => {
    if (entry.track !== filters.track) return false;
    if (filters.scope && scopeOf(entry) !== filters.scope) return false;
    if (filters.open && !isOpenFor(entry, filters.open)) return false;
    if (tiers.length > 0 && !(entry.prTier && tiers.includes(entry.prTier))) return false;
    if (stages.length > 0 && !(entry.stage && stages.includes(entry.stage))) return false;
    if (filters.badge && !entry.badges.some((badge) => badge.kind === filters.badge)) return false;
    if (facets.length > 0 && !facetsOf(entry).some((value) => facets.includes(searchable(value)))) return false;
    if (!query) return true;
    return searchable(
      [entry.name, entry.owner, ...entry.links.map((link) => link.label), entry.description, entry.language, ...entry.labels].join(" "),
    ).includes(query);
  });

  const sort = filters.sort && sortsFor(filters.track).includes(filters.sort) ? filters.sort : "";
  // Whatever is unknown — no push seen, no stars counted — goes last, not first.
  if (sort === "updated") return matched.toSorted((a, b) => latestFirst(a.updatedAt, b.updatedAt));
  if (sort === "stars") return matched.toSorted((a, b) => (b.stars ?? -1) - (a.stars ?? -1));
  if (sort === "active") return matched.toSorted((a, b) => latestFirst(a.activeAt, b.activeAt));
  // Ready for PRs puts an admin's picks first — only those still taking PRs,
  // then by tier; a pick nobody can send a PR to stays where its tier puts it.
  if (sort === "ready") return matched.toSorted((a, b) => pickRank(a) - pickRank(b) || tierRank(a) - tierRank(b));
  // By default an admin's picks stay on top, and everything else is the
  // newest listed first.
  return matched.toSorted((a, b) => Number(b.adminPick) - Number(a.adminPick) || latestFirst(a.listedAt, b.listedAt));
}

function pickRank(entry: DirectoryEntry): number {
  return entry.adminPick && entry.welcomesPRs ? 0 : 1;
}

function latestFirst(a: string | null, b: string | null): number {
  const left = a ? Date.parse(a) : NaN;
  const right = b ? Date.parse(b) : NaN;
  return (Number.isFinite(right) ? right : -Infinity) - (Number.isFinite(left) ? left : -Infinity) || 0;
}

/** How long an entry counts as new to the directory: a week, no more. */
export const NEW_DAYS = 7;

/** Listed in the last `NEW_DAYS` days. */
export function isNew(entry: DirectoryEntry, now = Date.now()): boolean {
  const listed = entry.listedAt ? Date.parse(entry.listedAt) : NaN;
  return Number.isFinite(listed) && now - listed <= NEW_DAYS * 86_400_000;
}

/**
 * How long a product may go without any activity here before its role card
 * recedes, the way an inactive repository does on the code path: still
 * listed, but not presented as somebody waiting for help.
 */
export const QUIET_DAYS = 60;

export function isQuiet(entry: DirectoryEntry, now = Date.now()): boolean {
  const active = entry.activeAt ? Date.parse(entry.activeAt) : NaN;
  return Number.isFinite(active) && now - active > QUIET_DAYS * 86_400_000;
}

/** How many products on the role path sit at each stage, in stage order. Empty when they all share one. */
export function stageCounts(entries: DirectoryEntry[], track: DirectoryTrack): { stage: Stage; count: number }[] {
  if (track !== "role") return [];
  const counts = STAGES.map((stage) => ({
    stage,
    count: entries.filter((entry) => entry.track === track && entry.stage === stage).length,
  })).filter(({ count }) => count > 0);
  return counts.length > 1 ? counts : [];
}

function tierRank(entry: DirectoryEntry): number {
  return entry.prTier ? PR_TIERS.indexOf(entry.prTier) : PR_TIERS.length;
}

/** How many entries on the code path sit at each PR tier, in tier order. Empty when they all share one. */
export function prTierCounts(entries: DirectoryEntry[]): { tier: PRTier; count: number }[] {
  const counts = PR_TIERS.map((tier) => ({
    tier,
    count: entries.filter((entry) => entry.track === "github" && entry.prTier === tier).length,
  })).filter(({ count }) => count > 0);
  return counts.length > 1 ? counts : [];
}

/** How many entries on one path carry each badge, in the order badges are defined. */
export function badgeCounts(entries: DirectoryEntry[], track: DirectoryTrack): { kind: BadgeKind; count: number }[] {
  return BADGE_KINDS.map((kind) => ({
    kind,
    count: entries.filter((entry) => entry.track === track && entry.badges.some((badge) => badge.kind === kind)).length,
  })).filter(({ count }) => count > 0);
}

/**
 * The openings worth offering as filters on one path: only those that would
 * actually narrow it — not one no entry has, and not one every entry has
 * (every entry on the role path has open roles).
 */
export function openingCounts(entries: DirectoryEntry[], track: DirectoryTrack): { open: DirectoryOpening; count: number }[] {
  const onTrack = entries.filter((entry) => entry.track === track);
  // On the code path, pull requests have their own finer filter: the tiers;
  // the builders site shows nothing of GitHub's, pull requests included.
  const openings = DIRECTORY_OPENINGS.filter((open) => !(open === "prs" && (track === "github" || !isOss)));
  return openings.map((open) => ({ open, count: onTrack.filter((entry) => isOpenFor(entry, open)).length })).filter(
    ({ count }) => count > 0 && count < onTrack.length,
  );
}

export function openingLabel(open: DirectoryOpening, locale: Locale): string {
  if (open === "prs") return tx(locale, "Menerima PR", "Accepting PRs");
  // On the builders site every product is listed, so this is the one that narrows it.
  return isOss ? tx(locale, "Juga buka peran", "Also has open roles") : tx(locale, "Lagi cari bantuan", "Looking for help");
}

/** The chips for one path, most common first. */
export function directoryFacets(entries: DirectoryEntry[], track: DirectoryTrack): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.track !== track) continue;
    for (const value of facetsOf(entry)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Local or global: the toggle on the code path. Local is what somebody here
 * can reach — a repo we maintain or a member's product — and a repository
 * whose maintainers are Indonesian, which a visitor counts as local whatever
 * list it sits on. Global is the rest of open source.
 */
export const DIRECTORY_SCOPES = ["local", "global"] as const;
export type DirectoryScope = (typeof DIRECTORY_SCOPES)[number];

export function isDirectoryScope(value: string): value is DirectoryScope {
  return (DIRECTORY_SCOPES as readonly string[]).includes(value);
}

export function scopeOf(entry: DirectoryEntry): DirectoryScope {
  return entry.source === "community" || entry.badges.some((badge) => badge.kind === "indonesian") ? "local" : "global";
}

export function scopeLabel(scope: DirectoryScope | "", locale: Locale): string {
  if (scope === "local") return tx(locale, "Lokal", "Local");
  if (scope === "global") return tx(locale, "Global", "Global");
  return tx(locale, "Semua", "All");
}

/** How many entries on one path are local and global. Empty when one of them has none: no toggle to offer. */
export function scopeCounts(entries: DirectoryEntry[], track: DirectoryTrack): { scope: DirectoryScope; count: number }[] {
  const onTrack = entries.filter((entry) => entry.track === track);
  const counts = DIRECTORY_SCOPES.map((scope) => ({ scope, count: onTrack.filter((entry) => scopeOf(entry) === scope).length }));
  return counts.every(({ count }) => count > 0) ? counts : [];
}

/**
 * The tile's image: the product's own logo, else (left empty) its website's
 * favicon, which the tile fetches itself, else its GitHub owner's avatar.
 * GitHub's generic Octocat — what a repo page offers as its image, so what an
 * import from a repo link saves — counts as no logo: it looks the same on
 * every card.
 */
function productLogo(logoUrl: string, website: string, repository: { owner: string } | null): string {
  const generic = /^https:\/\/github\.githubassets\.com\//.test(logoUrl);
  if (logoUrl && !generic) return logoUrl;
  if (website || !repository) return "";
  return `https://github.com/${encodeURIComponent(repository.owner)}.png?size=80`;
}

/** `www.example.com/app` → `example.com`, for a link that reads at a glance. */
function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

function searchable(value: string): string {
  return value
    .toLocaleLowerCase("id")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
