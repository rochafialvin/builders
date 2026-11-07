import type { MetadataRoute } from "next";
import { siteUrl } from "./content";
import { isOss } from "./lib/site";
import { listPeople, listProjects } from "./lib/data";
import { listedRepos } from "./lib/directory-read";
import { repoPagePath } from "./lib/directory";

/**
 * Every page worth finding from outside.
 *
 * Profiles are the point of this file as much as projects are: a portfolio
 * nobody can find is not doing any promoting. Pages behind a sign-in
 * (`/inbox`, `/new`, the edit form) are left out — they already say
 * `robots: noindex` for themselves.
 *
 * A database that is unreachable costs the listing, not the file: the static
 * routes still ship, so crawlers get something rather than a 500.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/directory`, changeFrequency: "daily", priority: 0.8 },
    ...(isOss ? [{ url: `${siteUrl}/leaderboard`, changeFrequency: "weekly" as const, priority: 0.5 }] : []),
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/community`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/how-it-works`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/feedback`, changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const [projects, people, repos] = await Promise.all([
      isOss ? Promise.resolve([]) : listProjects(),
      listPeople(),
      // Each listed repo's page, the open source site's own share link.
      isOss ? listedRepos("en") : Promise.resolve([]),
    ]);

    return [
      ...base,
      ...projects.map((project) => ({
        url: `${siteUrl}/projects/${project.slug}`,
        lastModified: new Date(project.createdAt),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...repos.map((repo) => ({
        url: `${siteUrl}${repoPagePath(repo)}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...people.map((person) => ({
        url: `${siteUrl}/u/${person.username}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.warn("[builders] Sitemap was published without project and people listings:", error);
    return base;
  }
}
