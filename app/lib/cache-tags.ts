/**
 * The names cached reads are filed under, and writes invalidate.
 *
 * Kept in one small module with no Supabase import so both sides can reach it:
 * `data.ts` tags its `use cache` scopes with these, and `actions.ts` calls
 * `updateTag` with the same names after a write. A tag that only one side
 * knows about is a stale page nobody can explain, so they are never spelled
 * out inline.
 *
 * Two levels, deliberately:
 *
 *   - the broad tags (`projects`, `people`, `seats`) cover the lists, where a
 *     single new project changes every filtered view of the board and there is
 *     no cheap way to say which;
 *   - the narrow ones (`project(slug)`, `person(username)`) cover the detail
 *     pages, so editing one project does not throw away every other one.
 *
 * A write usually touches both: `updateProject` invalidates its own page and
 * the lists it appears in.
 */
export const tags = {
  /** Every list built from `project_overview`. */
  projects: "projects",
  /** One project's detail page, by slug. */
  project: (slug: string) => `project:${slug}`,
  /** Every list built from `profiles`. */
  people: "people",
  /** One person's profile and portfolio, by username. */
  person: (username: string) => `person:${username}`,
  /** Seats: open-role counts, role suggestions, who is on which project. */
  seats: "seats",
  /** The discussion on one project. */
  comments: (slug: string) => `comments:${slug}`,
  /** The build log on one project. */
  updates: (slug: string) => `updates:${slug}`,
  /** The task board on one project. */
  tasks: (slug: string) => `tasks:${slug}`,
  /** One person's public trail and the numbers counted from it. */
  trail: (personId: string) => `trail:${personId}`,
  /**
   * The site-wide trail: what has happened anywhere, newest first.
   *
   * Broad on purpose. Home and Explore both read it, and any event by anybody
   * can change the top of that list, so there is nothing narrower to name.
   */
  activity: "activity",
  /**
   * The trail shown on one project's page.
   *
   * By slug, because that is the identifier every write in `actions.ts`
   * already has in hand; the numeric id would mean an extra lookup just to
   * name the thing being invalidated.
   */
  projectTrail: (slug: string) => `project-trail:${slug}`,
  /**
   * Every member's open source record — the directory's people badges and
   * the open source section of each profile are all built from it.
   */
  oss: "oss",
  /** The approved open source catalogue the directory lists. */
  catalogue: "catalogue",
  /** One GitHub account's summary on a profile, by lower-cased login. */
  githubProfile: (login: string) => `github-profile:${login}`,
  /** Emoji left on pull requests on /activity. */
  reactions: "reactions",
  /** The repos and products a site admin puts first in the directory. */
  adminPicks: "admin-picks",
} as const;
