import { listAdminPicks, listOssMembers, listProjects, listRepoSignals } from "./data";
import { readPublicly } from "./public-read";
import { projectBlurb } from "./brief";
import { productEntries, repoEntry, scopeOf, type DirectoryEntry } from "./directory";
import { listOpenSourceRepos, signalsFor } from "./open-source-live";
import { parseGitHubRepositoryUrl } from "./github";
import { roleLabel } from "./roles";
import type { Locale } from "./locale";
import { isOss } from "./site";

/**
 * Everything listed, both tracks. Every read underneath is cached, so the
 * heading's numbers and the list share one trip to the database.
 */
export async function readDirectory(locale: Locale) {
  // GitHub's facts come from the database, read once and shared by catalogue
  // repos and products; nothing on this page calls GitHub.
  // Only the catalogue waits for the signals; the products and the members'
  // records start at the same time, rather than queueing behind them.
  const signalsRead = readPublicly("repository signals in the directory", () => listRepoSignals(), {});
  const [reposResult, projectsResult, membersResult, signalsResult, picksResult] = await Promise.all([
    signalsRead.then(({ value }) =>
      readPublicly("open source repos in the directory", () => listOpenSourceRepos(value), []),
    ),
    readPublicly("products in the directory", () => listProjects({ lane: "active" }), []),
    readPublicly("members' open source records in the directory", () => listOssMembers(), []),
    signalsRead,
    readPublicly("admin picks in the directory", () => listAdminPicks(), { repoIds: [], projectIds: [] }),
  ]);
  const pickedRepos = new Set(picksResult.value.repoIds);
  const pickedProjects = new Set(picksResult.value.projectIds);
  const signals = signalsResult.value;

  const repos = reposResult.value.map((repo) => ({ ...repo, adminPick: pickedRepos.has(repo.id) }));
  const members = membersResult.value;
  const products = projectsResult.value.map((project) => {
    const repository = parseGitHubRepositoryUrl(project.repoUrl);
    const found = repository ? signalsFor(signals, repository.owner, repository.repo) : null;
    return {
      ...project,
      repoStats: found?.stats ?? null,
      repoActivity: found?.activity ?? null,
      adminPick: pickedProjects.has(project.id),
    };
  });
  const roleName = (role: string) => roleLabel(role, "", locale);
  const entries: DirectoryEntry[] = isOss
    ? [
        ...repos.filter((repo) => repo.list === "internal").map((repo) => repoEntry(repo, locale, members)),
        ...repos.filter((repo) => repo.list === "recommended").map((repo) => repoEntry(repo, locale, members)),
        // The open source site keeps members' products that take PRs — their
        // card is the repository — and leaves the role path to the builders site.
        ...products.flatMap((project) => productEntries(project, projectBlurb, roleName, locale)),
      ].filter((entry) => entry.track === "github")
    : // The builders site is a directory of products, every active one, with
      // nothing of GitHub's: no repos, and no repository link on a card.
      products
        .flatMap((project) => productEntries(project, projectBlurb, roleName, locale, { everyProduct: true }))
        .filter((entry) => entry.track === "role")
        .map((entry) => ({ ...entry, links: entry.links.filter((link) => link.kind !== "github") }));
  return { entries, members, unavailable: reposResult.unavailable || projectsResult.unavailable };
}

/**
 * The repositories the directory counts as local — a community member's
 * project, or one whose maintainers are Indonesian — as `owner/name` in lower
 * case. The activity page splits pull requests into local and global by it,
 * so the two pages agree on what "local" means; a repository the directory
 * does not list is global.
 */
export async function localRepos(locale: Locale): Promise<string[]> {
  const { entries } = await readDirectory(locale);
  return [...new Set(entries.filter((entry) => entry.repo && scopeOf(entry) === "local").map((entry) => entry.repo as string))];
}

/**
 * The directory's entry for one GitHub repository, `owner` and `repo` in any
 * case — what a repo's page is built from. Only what the directory lists has a
 * page; anything else is null.
 */
export async function findListedRepo(locale: Locale, owner: string, repo: string): Promise<DirectoryEntry | null> {
  const key = `${owner}/${repo}`.toLowerCase();
  const { entries } = await readDirectory(locale);
  return entries.find((entry) => entry.track === "github" && entry.repo === key) ?? null;
}

/** Every listed repository with a page, as `owner/name` in lower case. */
export async function listedRepos(locale: Locale): Promise<string[]> {
  const { entries } = await readDirectory(locale);
  return [...new Set(entries.filter((entry) => entry.track === "github" && entry.repo).map((entry) => entry.repo as string))];
}
