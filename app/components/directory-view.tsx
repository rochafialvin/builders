"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "./responsive-link";
import { InstantLink, InstantNav } from "./instant-link";
import { FilterPanel, type ActiveFilter } from "./filter-panel";
import { ProjectLogo } from "./project-logo";
import { HeaderMenu } from "./header-menu";
import { LinkIcon } from "./link-icons";
import { StarCount, StarLink } from "./star-button";
import { RelativeTime } from "./relative-time";
import {
  badgeCounts,
  directoryFacets,
  filterDirectory,
  isNew,
  isQuiet,
  openingCounts,
  openingLabel,
  paginate,
  prTierCounts,
  prTierLabel,
  repoPagePath,
  sortLabel,
  sortsFor,
  scopeCounts,
  scopeLabel,
  stageCounts,
  type DirectoryEntry,
  type DirectoryFilters,
  type DirectoryTrack,
  type PRTier,
  type SharedBy,
} from "../lib/directory";
import { badgeKindLabel, badgeLabel, badgePeople, type Badge, type BadgeKind } from "../lib/badges";
import { pathFor, readFilters, readPage } from "../lib/directory-url";
import { tx, type Locale } from "../lib/locale";
import { isOss } from "../lib/site";
import { contribReadyUrl } from "../content";
import { stageLabel, stageMeta } from "../lib/stages";

/** The one path each site lists: code on the open source site, products on builders. */
const TRACKS: readonly DirectoryTrack[] = isOss ? ["github"] : ["role"];

/** How long typing rests before the address catches up. Browsers throttle history writes. */
const SEARCH_SETTLE_MS = 300;

/** `list` with `value` added, or taken out if it was there: a chip in a group that takes several. */
function toggled<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((each) => each !== value) : [...current, value];
}

/**
 * The filters as hidden fields, for a GET form that changes one of them — the
 * search box, or the sort without JavaScript — and must keep the rest.
 */
function HiddenFilters({ filters, except }: { filters: DirectoryFilters; except: "q" | "sort" }) {
  const fields: [string, string][] = [
    ...(filters.track !== "github" ? [["track", filters.track] as [string, string]] : []),
    ...(filters.scope ? [["scope", filters.scope] as [string, string]] : []),
    ...(filters.open ? [["open", filters.open] as [string, string]] : []),
    ...(filters.pr ?? []).map((tier) => ["pr", tier] as [string, string]),
    ...(filters.badge ? [["badge", filters.badge] as [string, string]] : []),
    ...filters.facet.map((facet) => ["facet", facet] as [string, string]),
    ...(filters.stage ?? []).map((stage) => ["phase", stage] as [string, string]),
    ...(except !== "q" && filters.q ? [["q", filters.q] as [string, string]] : []),
    ...(except !== "sort" && filters.sort ? [["sort", filters.sort] as [string, string]] : []),
  ];
  return fields.map(([name, value]) => <input key={`${name}=${value}`} type="hidden" name={name} value={value} />);
}

/**
 * The directory's list, filtered where it is shown.
 *
 * The page hands over every entry on both tracks — a few hundred rows at
 * most, already read from the cache — so a tab, a facet, a page, or a search
 * is a re-render here rather than a request to the server. The address still
 * follows every choice (`history.pushState`, which the router keeps in step
 * with `useSearchParams`), so a filtered view can be shared, reloaded, and
 * left with Back; and every filter is still a real link for a new tab or a
 * browser without JavaScript.
 */
export function DirectoryView({
  entries,
  locale,
  unavailable,
}: {
  entries: DirectoryEntry[];
  locale: Locale;
  unavailable: boolean;
}) {
  const searchParams = useSearchParams();
  const fromUrl = readFilters(searchParams);
  // What is typed is held here and written to the address once typing rests:
  // the list follows every key, the history does not.
  const [q, setQ] = useState(fromUrl.q);
  const settle = useRef<number | undefined>(undefined);
  const results = useRef<HTMLElement>(null);
  // "New" and a quiet role card depend on today, which the server's render
  // cannot know without giving up its cache: read the clock once hydrated, as
  // RelativeTime does. Until then neither shows.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Back and Forward make the address the truth again.
  useEffect(() => {
    const onPop = () => {
      window.clearTimeout(settle.current);
      setQ(readFilters(new URLSearchParams(window.location.search)).q);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.clearTimeout(settle.current);
    };
  }, []);

  const navigate = useCallback((href: string) => {
    window.clearTimeout(settle.current);
    const url = new URL(href, window.location.href);
    setQ(readFilters(url.searchParams).q);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    // The list changed under the reader; if its top has scrolled away, bring it back.
    const list = results.current;
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: "start" });
  }, []);

  const search = (value: string, now = false) => {
    setQ(value);
    window.clearTimeout(settle.current);
    const write = () => window.history.replaceState(null, "", pathFor({ ...fromUrl, q: value.trim().slice(0, 100) }));
    if (now) write();
    else settle.current = window.setTimeout(write, SEARCH_SETTLE_MS);
  };

  const filters = { ...fromUrl, q: q.slice(0, 100) };
  // A search still settling has already left the page it started on.
  const requestedPage = q === fromUrl.q ? readPage(searchParams) : "1";
  // The address is the filters' identity: the arrays in them are new on every render.
  const filterKey = pathFor(filters);
  const matched = useMemo(() => filterDirectory(entries, filters), [entries, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = paginate(matched, requestedPage);
  const facets = directoryFacets(entries, filters.track);
  const scopes = scopeCounts(entries, filters.track);
  // Indonesian maintainers count as local, so the toggle asks it; the card keeps the badge.
  const badges = badgeCounts(entries, filters.track).filter(({ kind }) => kind !== "indonesian");
  const openings = openingCounts(entries, filters.track);
  const tiers = filters.track === "github" ? prTierCounts(entries) : [];
  const stages = stageCounts(entries, filters.track);
  const sorts = sortsFor(filters.track);
  const code = filters.track === "github";
  const filtered = Boolean(
    filters.scope || filters.open || filters.pr?.length || filters.badge || filters.facet.length || filters.stage?.length || filters.q,
  );
  // Reset drops what narrows the list; the order asked for stays.
  const reset = pathFor({ track: filters.track, scope: "", open: "", pr: [], badge: "", facet: [], stage: [], sort: filters.sort, q: "" });
  // What a phone's filter bar shows as chips, each one a link that drops it.
  const active: ActiveFilter[] = [
    ...(filters.pr ?? []).map((tier) => ({ label: prTierLabel(tier, locale), href: pathFor({ ...filters, pr: toggled(filters.pr, tier) }) })),
    ...(filters.stage ?? []).map((stage) => ({ label: stageLabel(stage, locale), href: pathFor({ ...filters, stage: toggled(filters.stage, stage) }) })),
    ...(filters.open ? [{ label: openingLabel(filters.open, locale), href: pathFor({ ...filters, open: "" }) }] : []),
    ...(filters.badge ? [{ label: badgeKindLabel(filters.badge, locale), href: pathFor({ ...filters, badge: "" }) }] : []),
    ...filters.facet.map((facet) => ({ label: facet, href: pathFor({ ...filters, facet: toggled(filters.facet, facet) }) })),
  ];
  // A new path starts plain: its groups and its orders are not this one's.
  const trackHref = (track: DirectoryTrack) =>
    pathFor({ track, scope: "", open: "", pr: [], badge: "", facet: [], stage: [], sort: "", q: filters.q });

  return (
    <InstantNav navigate={navigate}>
    <div className="dx-layout">
      {/* On a phone the first choice is a two-way tab across the top; the
          sidebar group below says the same thing on a wide screen. */}
      {TRACKS.length > 1 ? (
        <nav className="dx-mtabs" aria-label={tx(locale, "Cara kontribusi", "How to contribute")}>
          {TRACKS.map((track) => (
            <InstantLink
              key={track}
              className={filters.track === track ? "is-active" : ""}
              aria-current={filters.track === track ? "page" : undefined}
              href={trackHref(track)}
            >
              <TrackIcon track={track} />
              {tx(locale, TRACK_COPY[track].titleId, TRACK_COPY[track].titleEn)}
              <span>{entries.filter((entry) => entry.track === track).length}</span>
            </InstantLink>
          ))}
        </nav>
      ) : null}

      <FilterPanel active={active}>
        {TRACKS.length > 1 ? (
          <FacetGroup className="dx-facet-tracks" title={tx(locale, "Cara kontribusi", "How to contribute")}>
            {TRACKS.map((track) => (
              <FacetLink
                key={track}
                active={filters.track === track}
                href={trackHref(track)}
                count={entries.filter((entry) => entry.track === track).length}
                icon={<TrackIcon track={track} />}
                note={tx(locale, TRACK_COPY[track].noteId, TRACK_COPY[track].noteEn)}
              >
                {tx(locale, TRACK_COPY[track].titleId, TRACK_COPY[track].titleEn)}
              </FacetLink>
            ))}
          </FacetGroup>
        ) : null}
        {tiers.length > 0 ? (
          <FacetGroup title={tx(locale, "Status PR", "PR status")}>
            {tiers.map(({ tier, count }) => (
              <FacetLink
                key={tier}
                active={filters.pr?.includes(tier) ?? false}
                href={pathFor({ ...filters, pr: toggled(filters.pr, tier) })}
                count={count}
                icon={<span className={`dx-tier-dot dx-tier-dot-${tier}`} aria-hidden="true" />}
              >
                {prTierLabel(tier, locale)}
              </FacetLink>
            ))}
          </FacetGroup>
        ) : null}

        {stages.length > 0 ? (
          <FacetGroup title={tx(locale, "Tahap produk", "Product stage")}>
            {stages.map(({ stage, count }) => (
              <FacetLink
                key={stage}
                active={filters.stage?.includes(stage) ?? false}
                href={pathFor({ ...filters, stage: toggled(filters.stage, stage) })}
                count={count}
                icon={<span className={`dx-stage-dot dx-stage-dot-${stage}`} aria-hidden="true" />}
              >
                {stageLabel(stage, locale)}
              </FacetLink>
            ))}
          </FacetGroup>
        ) : null}

        {openings.length > 0 ? (
          <FacetGroup title={tx(locale, "Terbuka untuk", "Open for")}>
            {openings.map(({ open, count }) => (
              <FacetLink
                key={open}
                active={filters.open === open}
                href={pathFor({ ...filters, open: filters.open === open ? "" : open })}
                count={count}
                icon={<span className={`dx-open-dot dx-open-dot-${open}`} aria-hidden="true" />}
              >
                {openingLabel(open, locale)}
              </FacetLink>
            ))}
          </FacetGroup>
        ) : null}

        {badges.length > 0 ? (
          <FacetGroup title={tx(locale, "Tanda", "Signals")}>
            {badges.map(({ kind, count }) => (
              <FacetLink
                key={kind}
                active={filters.badge === kind}
                href={pathFor({ ...filters, badge: filters.badge === kind ? "" : kind })}
                count={count}
                icon={<BadgeIcon kind={kind} />}
              >
                {badgeKindLabel(kind, locale)}
              </FacetLink>
            ))}
          </FacetGroup>
        ) : null}


        {facets.length > 0 ? (
          <FacetGroup
            title={code ? tx(locale, "Bahasa", "Languages") : tx(locale, "Peran yang dicari", "Roles wanted")}
            more={code ? tx(locale, "Bahasa lainnya…", "More languages…") : tx(locale, "Peran lainnya…", "More roles…")}
            openMore={facets.some(({ value }, index) => index >= FACETS_SHOWN && filters.facet.includes(value))}
          >
            {facets.map(({ value, count }) => (
              <FacetLink
                key={value}
                active={filters.facet.includes(value)}
                href={pathFor({ ...filters, facet: toggled(filters.facet, value) })}
                count={count}
                icon={code ? <LanguageDot language={value} /> : undefined}
              >
                {value}
              </FacetLink>
            ))}
          </FacetGroup>
        ) : null}
      </FilterPanel>

      <section ref={results} className="dx-results" aria-label={tx(locale, "Hasil", "Results")}>
        <div className="dx-toolbar">
          <form
            className="dx-search"
            action="/directory"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              search(q, true);
            }}
          >
            <HiddenFilters filters={filters} except="q" />
            <label>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <span className="sr-only">{tx(locale, "Cari project", "Search projects")}</span>
              <input type="search" name="q" value={q} onChange={(event) => search(event.target.value)} placeholder={tx(locale, "Cari project…", "Search projects…")} />
            </label>
          </form>
          {/* Local or global: the first thing somebody narrows open source by,
              so a toggle in plain sight rather than a group in the sidebar. */}
          {scopes.length > 0 ? (
            <nav className="dx-scope" aria-label={tx(locale, "Lokal atau global", "Local or global")}>
              {(["", ...scopes.map(({ scope }) => scope)] as const).map((scope) => (
                <InstantLink
                  key={scope || "all"}
                  className={(filters.scope ?? "") === scope ? "is-active" : ""}
                  aria-current={(filters.scope ?? "") === scope ? "true" : undefined}
                  href={pathFor({ ...filters, scope })}
                >
                  {scopeLabel(scope, locale)}
                  {scope ? <span>{scopes.find((each) => each.scope === scope)?.count}</span> : null}
                </InstantLink>
              ))}
            </nav>
          ) : null}
          {/* How many, and in what order: together at the row's end, above
              the cards' own buttons. */}
          <div className="dx-toolbar-end">
            <p className="dx-count" role="status">
              <strong>{matched.length}</strong> {tx(locale, "project", matched.length === 1 ? "project" : "projects")}
              {filtered ? <> · <InstantLink href={reset}>{tx(locale, "reset", "reset")}</InstantLink></> : null}
            </p>
            {/* A real GET form, like the search: without JavaScript the button
                beside the select sends it; with it, picking is enough. */}
            <form className="dx-sort" action="/directory">
              <HiddenFilters filters={filters} except="sort" />
              <label>
                <span className="sr-only">{tx(locale, "Urutkan", "Sort by")}</span>
                <select
                  name="sort"
                  value={filters.sort ?? ""}
                  onChange={(event) => navigate(pathFor({ ...filters, sort: sorts.find((sort) => sort === event.target.value) ?? "" }))}
                >
                  {(["", ...sorts] as const).map((sort) => (
                    <option key={sort} value={sort}>{sortLabel(sort, filters.track, locale)}</option>
                  ))}
                </select>
              </label>
              <noscript>
                <button type="submit">{tx(locale, "Urutkan", "Sort")}</button>
              </noscript>
            </form>
          </div>
        </div>

        {unavailable ? (
          <p className="public-data-notice" role="status">
            {tx(locale, "Sebagian daftar tidak dapat dimuat.", "Part of the list could not be loaded.")} <a href={pathFor(filters)}>{tx(locale, "Muat ulang", "Reload")}</a>.
          </p>
        ) : null}

        <div className={`dx-table dx-table-${filters.track}`} role="table" aria-label={tx(locale, "Daftar project", "Project list")}>
          <div className="dx-row dx-row-head" role="row">
            <span role="columnheader">Project</span>
            {code ? null : <span role="columnheader">{tx(locale, "Mencari", "Looking for")}</span>}
            <span role="columnheader"><span className="sr-only">{tx(locale, "Aksi", "Action")}</span></span>
          </div>

          {matched.length > 0 ? (
            shown.items.map((entry) => <DirectoryRow key={entry.key} entry={entry} locale={locale} now={now} />)
          ) : (
            <div className="dx-empty" role="row">
              <p role="cell">
                {tx(locale, "Tidak ada project yang cocok.", "No project matches.")}{" "}
                <InstantLink href={reset}>{tx(locale, "Reset filter", "Reset filters")}</InstantLink>
                {code ? (
                  <>
                    {tx(locale, ", atau cari repo global di ", ", or look for global repos on ")}
                    <ContribReadyLink />.
                  </>
                ) : null}
              </p>
            </div>
          )}
        </div>

        {shown.pages > 1 ? (
          <nav className="dx-pager" aria-label={tx(locale, "Halaman", "Pages")}>
            {shown.page > 1 ? (
              <InstantLink href={pathFor(filters, shown.page - 1)} rel="prev">
                <span aria-hidden="true">←</span> {tx(locale, "Sebelumnya", "Previous")}
              </InstantLink>
            ) : (
              <span aria-hidden="true" />
            )}
            <p>
              {tx(locale, `Halaman ${shown.page} dari ${shown.pages}`, `Page ${shown.page} of ${shown.pages}`)}
            </p>
            {shown.page < shown.pages ? (
              <InstantLink href={pathFor(filters, shown.page + 1)} rel="next">
                {tx(locale, "Berikutnya", "Next")} <span aria-hidden="true">→</span>
              </InstantLink>
            ) : (
              <span aria-hidden="true" />
            )}
          </nav>
        ) : null}

        <p className="dx-suggest">
          {filters.track === "github"
            ? tx(locale, "Tahu repo yang layak masuk? ", "Know a repo that belongs here? ")
            : tx(locale, "Punya produk yang butuh bantuan? ", "Have a product that needs a hand? ")}
          {filters.track === "github" ? (
            <Link href="/recommend">{tx(locale, "Usulkan repo", "Suggest a repo")}</Link>
          ) : (
            <Link href="/new">{tx(locale, "Daftarkan produk dan buka peran", "List it and open a role")}</Link>
          )}
        </p>
        {/* More global repos than this list holds: ContribReady ranks them by
            how welcoming they are, refreshed daily. */}
        {code ? (
          <p className="dx-suggest dx-suggest-more">
            {tx(locale, "Cari lebih banyak repo global yang ramah kontributor? ", "Looking for more global repos that welcome contributors? ")}
            <ContribReadyLink />
          </p>
        ) : null}
      </section>
    </div>
    </InstantNav>
  );
}


const TRACK_COPY: Record<DirectoryTrack, { titleId: string; titleEn: string; noteId: string; noteEn: string }> = {
  github: {
    titleId: "Kode di GitHub",
    titleEn: "Code on GitHub",
    noteId: "Kirim pull request",
    noteEn: "Send a pull request",
  },
  role: {
    titleId: "Peran lain",
    titleEn: "Other roles",
    noteId: "Desain, produk, riset, konten",
    noteEn: "Design, product, research, content",
  },
};

/** GitHub's own colours for the languages in the catalogue, so a dot reads at a glance. */
const LANGUAGE_COLOURS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Go: "#00add8",
  Python: "#3572a5",
  PHP: "#4f5d95",
  Markdown: "#083fa1",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#a97bff",
  Dart: "#00b4ab",
  Ruby: "#701516",
  Swift: "#f05138",
  HTML: "#e34c26",
  CSS: "#663399",
  "Objective-C": "#438eff",
  Shell: "#89e051",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  "Jupyter Notebook": "#da5b0b",
  Elixir: "#6e4a7e",
  Lua: "#000080",
};

/** How many entries a long group shows before folding the rest away, as GitHub does with languages. */
const FACETS_SHOWN = 6;

export function FacetGroup({
  title,
  className = "",
  more,
  openMore = false,
  children,
}: {
  title: string;
  className?: string;
  /** Label for the fold, when the group may run long. */
  more?: string;
  /** Unfolded from the start, because what is selected is inside it. */
  openMore?: boolean;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  const shown = more ? items.slice(0, FACETS_SHOWN) : items;
  const rest = more ? items.slice(FACETS_SHOWN) : [];
  return (
    <div className={`dx-facet ${className}`}>
      <p className="dx-facet-title">{title}</p>
      <ul>
        {shown}
        {rest.length > 0 ? (
          <li className="dx-facet-more">
            <details open={openMore}>
              <summary>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
                {more}
              </summary>
              <ul>{rest}</ul>
            </details>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function FacetLink({
  active,
  href,
  count,
  icon,
  note,
  children,
}: {
  active: boolean;
  href: string;
  count: number;
  icon?: React.ReactNode;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <InstantLink
        className={`dx-facet-link ${active ? "is-active" : ""}`}
        aria-current={active ? "true" : undefined}
        href={href}
      >
        {icon}
        <span className="dx-facet-label">
          {children}
          {note ? <small>{note}</small> : null}
        </span>
        <span className="dx-facet-count">{count}</span>
      </InstantLink>
    </li>
  );
}

/**
 * One badge on a row. When it names people, their GitHub avatars ride along —
 * a face is what makes "a friend has been here" believable. With one person
 * the badge links to them: their profile here when the badge comes from
 * members' own records, their GitHub otherwise. With several, it opens a list
 * of them all, so nobody stands in for the rest.
 */
export function BadgeChip({ badge, locale }: { badge: Badge; locale: Locale }) {
  const people = badgePeople(badge);
  const label = badgeLabel(badge, locale);
  const title = people.length > 0 ? `${label}: ${people.map((person) => `@${person}`).join(", ")}` : label;
  const content = (
    <>
      <BadgeIcon kind={badge.kind} />
      <span>{label}</span>
      {people.length > 0 ? (
        <span className="dx-badge-faces" aria-hidden="true">
          {people.slice(0, 3).map((person) => <BadgeFace key={person} person={person} />)}
        </span>
      ) : null}
    </>
  );

  // Members first, as they link here; hand-named people only on GitHub after.
  const members = badge.members ?? [];
  const named = new Set(members.map((member) => member.handle.toLowerCase()).filter(Boolean));
  const everyone = [
    ...members.map((member) => ({ key: member.username, name: member.name, handle: member.handle, href: `/u/${member.username}` })),
    ...people
      .filter((person) => !named.has(person.toLowerCase()))
      .map((person) => ({ key: person, name: `@${person}`, handle: person, href: `https://github.com/${person}` })),
  ];

  if (everyone.length > 1) {
    return (
      <li className={`dx-badge dx-badge-${badge.kind}`}>
        <HeaderMenu className="dx-badge-menu" summaryLabel={label} summary={content}>
          <ul className="dx-badge-people" aria-label={label}>
            {everyone.map((person) => {
              const inner = (
                <>
                  {person.handle ? <BadgeFace person={person.handle} /> : <span className="dx-badge-initial" aria-hidden="true">{person.name.slice(0, 1)}</span>}
                  <span>
                    {person.name}
                    {person.handle && person.name !== `@${person.handle}` ? <small>@{person.handle}</small> : null}
                  </span>
                </>
              );
              return (
                <li key={person.key}>
                  {person.href.startsWith("/") ? (
                    <Link href={person.href}>{inner}</Link>
                  ) : (
                    <a href={person.href} target="_blank" rel="noopener noreferrer">{inner}</a>
                  )}
                </li>
              );
            })}
          </ul>
        </HeaderMenu>
      </li>
    );
  }

  const profile = badge.profiles?.[0];

  return (
    <li className={`dx-badge dx-badge-${badge.kind}`} title={title}>
      {profile ? (
        <Link href={`/u/${profile}`} aria-label={title}>{content}</Link>
      ) : people.length > 0 ? (
        <a href={`https://github.com/${people[0]}`} target="_blank" rel="noopener noreferrer" aria-label={title}>{content}</a>
      ) : (
        content
      )}
    </li>
  );
}

function BadgeFace({ person }: { person: string }) {
  // GitHub serves a small avatar at this address for any username;
  // next/image would need the host allow-listed for a 20px picture.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://github.com/${person}.png?size=40`} alt="" width={18} height={18} loading="lazy" />;
}

export function BadgeIcon({ kind }: { kind: BadgeKind }) {
  if (kind === "admin-pick") {
    return (
      <svg className="dx-badge-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />
      </svg>
    );
  }
  if (kind === "indonesian") {
    return (
      <svg className="dx-badge-icon dx-flag" viewBox="0 0 16 12" aria-hidden="true">
        <rect width="16" height="6" fill="#e70011" />
        <rect y="6" width="16" height="6" fill="#fff" />
        <rect x=".5" y=".5" width="15" height="11" fill="none" stroke="#d4d4d8" />
      </svg>
    );
  }
  if (kind === "in-our-group") {
    return (
      <svg className="dx-badge-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.5M17.5 14a5 5 0 0 1 3 5" />
      </svg>
    );
  }
  return (
    <svg className="dx-badge-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

/** Where a repository stands on pull requests, as a pill beside its name. */
export function PrTierPill({ tier, locale }: { tier: PRTier; locale: Locale }) {
  return (
    <span className={`dx-prs dx-prs-${tier}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" />
        <path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4m2-2.5L10.5 6 13 8.5" />
      </svg>
      {prTierLabel(tier, locale)}
    </span>
  );
}

export function LanguageDot({ language }: { language: string }) {
  return <span className="dx-lang-dot" style={{ background: LANGUAGE_COLOURS[language] ?? "#a1a1aa" }} aria-hidden="true" />;
}

function TrackIcon({ track }: { track: DirectoryTrack }) {
  return track === "github" ? (
    <svg className="dx-track-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.58 9.58 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  ) : (
    <svg className="dx-track-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

/** Who put a catalogue repo forward, credited the way they stand to it. */
export function SharedByLine({ sharedBy, locale }: { sharedBy: SharedBy; locale: Locale }) {
  const name = <Link href={`/u/${sharedBy.username}`}>{sharedBy.name || sharedBy.username}</Link>;
  // The owner and maintainers share their own work; anybody else recommends it.
  // The name leads, as people know each other by it; their part comes after.
  const verb = sharedBy.role === "owner" || sharedBy.role === "maintainer"
    ? tx(locale, "Dibagikan oleh ", "Shared by ")
    : tx(locale, "Direkomendasikan oleh ", "Recommended by ");
  const role =
    sharedBy.role === "owner" ? tx(locale, "pemilik", "owner")
    : sharedBy.role === "maintainer" ? "maintainer"
    : sharedBy.role === "contributor" ? tx(locale, "kontributor", "contributor")
    : "";
  return (
    <p className="dx-shared">
      {verb}
      {name}
      {role ? ` (${role})` : null}
    </p>
  );
}

function DirectoryRow({ entry, locale, now }: { entry: DirectoryEntry; locale: Locale; now: number | null }) {
  const external = { target: "_blank", rel: "noopener noreferrer" };
  const owner = entry.kind === "product" ? tx(locale, `oleh ${entry.owner}`, `by ${entry.owner}`) : entry.owner;
  const code = entry.track === "github";
  const issues = code && entry.actionKind === "issues";
  // On the code path a card reads like a row of GitHub's repository list:
  // titled `owner/repo` in GitHub's own spelling, the owner's avatar beside
  // it, no separate repo or website links — the title is the repo link.
  const slug = entry.links.find((link) => link.kind === "github")?.label ?? `${entry.owner}/${entry.name}`;
  const title = code ? slug : entry.name;
  const avatar = code ? `https://github.com/${encodeURIComponent(slug.split("/")[0])}.png?size=80` : entry.logoUrl;
  // A repository not taking PRs, or a product nobody has touched in a while,
  // stays findable but recedes.
  const quiet = code ? Boolean(entry.prTier && !entry.welcomesPRs) : now !== null && isQuiet(entry, now);

  return (
    <div className={`dx-row ${quiet ? "dx-row-quiet" : ""}`} role="row">
      <div className="dx-cell-main" role="cell">
        <ProjectLogo
          className={`dx-logo ${code ? "dx-logo-avatar" : ""}`}
          title={title}
          website={code ? "" : entry.website}
          logoUrl={avatar}
          fallback={title.slice(0, 1).toUpperCase()}
        />
        <div className="dx-main-copy">
          <p className="dx-name">
            {/* A listed repo's name opens its page here, which can be shared
                and says who from the community has been there; GitHub is one
                click on from it, and the Star at the row's end goes there now. */}
            {code && entry.repo ? (
              <Link href={repoPagePath(entry.repo)}>{title}</Link>
            ) : entry.href.startsWith("http") ? (
              <a href={entry.href} {...external}>{title}</a>
            ) : (
              <Link href={entry.href}>{title}</Link>
            )}
            {/* An admin's pick is a mark on the name rather than a chip among
                the badges: it vouches for the project, not for people. */}
            {entry.adminPick ? (
              <span className="dx-pick" title={badgeLabel({ kind: "admin-pick" }, locale)}>
                <BadgeIcon kind="admin-pick" />
                <span className="sr-only">{badgeLabel({ kind: "admin-pick" }, locale)}</span>
              </span>
            ) : null}
            {/* The PR status belongs to the code path. A product asking for
                both simply appears on both tabs; neither card points at the
                other. */}
            {code && entry.prTier ? <PrTierPill tier={entry.prTier} locale={locale} /> : null}
            {code ? null : <span className="dx-owner">{owner}</span>}
            {now !== null && isNew(entry, now) ? <span className="dx-new">{tx(locale, "Baru", "New")}</span> : null}
          </p>
          {!code && entry.links.length > 0 ? (
            <p className="dx-links">
              {/* Icons only: the repo's name is already the card's title, and
                  the address is a hover away. */}
              {entry.links.map((link) => {
                const label = `${link.kind === "github" ? "GitHub" : tx(locale, "Situs", "Website")}: ${link.label}`;
                return (
                  <a key={link.kind} className="dx-icon-link" href={link.href} title={label} aria-label={label} {...external}>
                    <LinkIcon kind={link.kind} className="dx-link-icon" />
                  </a>
                );
              })}
            </p>
          ) : null}
          {entry.description ? <p className="dx-desc">{entry.description}</p> : null}
          {entry.sharedBy ? <SharedByLine sharedBy={entry.sharedBy} locale={locale} /> : null}
          {entry.badges.some((badge) => badge.kind !== "admin-pick") ? (
            <ul className="dx-badges" aria-label={tx(locale, "Tanda", "Signals")}>
              {entry.badges
                .filter((badge) => badge.kind !== "admin-pick")
                .map((badge) => <BadgeChip key={badge.kind} badge={badge} locale={locale} />)}
            </ul>
          ) : null}
          {entry.track === "github" && entry.labels.length > 0 ? (
            <p className="dx-tags">
              {entry.labels.map((label) => <span key={label} className="dx-tag">{label}</span>)}
            </p>
          ) : null}
          {/* GitHub's own footer line: language · stars · last push. */}
          {code && (entry.language || entry.stars !== null || entry.updatedAt || issues) ? (
            <p className="dx-meta">
              {entry.language ? <span className="dx-lang"><LanguageDot language={entry.language} />{entry.language}</span> : null}
              {entry.stars !== null && entry.repo ? <StarCount stars={entry.stars} /> : null}
              {/* A push, not a reply: bots push too, so this says when the
                  code last moved and nothing about who answers. */}
              {entry.updatedAt ? (
                <span title={tx(locale, "Push terakhir ke repo, termasuk dari bot", "The repo's last push, bots included")}>
                  {tx(locale, "Push terakhir ", "Last push ")}
                  <RelativeTime value={entry.updatedAt} locale={locale} />
                </span>
              ) : null}
              {/* Where a first PR starts. */}
              {issues ? (
                <a className="dx-issues-link" href={entry.actionHref} {...external}>
                  <svg className="dx-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
                  </svg>
                  {entry.kind === "repo" ? tx(locale, "Isu pemula", "Starter issues") : tx(locale, "Isu", "Issues")}
                </a>
              ) : null}
            </p>
          ) : null}
          {/* The role path's own footer line: how far along the product is,
              how many seats are still open, and when anything last happened —
              a card with no date cannot tell a waiting team from a gone one. */}
          {!code && (entry.stage || entry.openSeats > 0 || entry.activeAt) ? (
            <p className="dx-meta">
              {entry.stage ? (
                <span className="dx-stage" title={tx(locale, stageMeta[entry.stage].blurbId, stageMeta[entry.stage].blurb)}>
                  <span className={`dx-stage-dot dx-stage-dot-${entry.stage}`} aria-hidden="true" />
                  {stageLabel(entry.stage, locale)}
                </span>
              ) : null}
              {entry.openSeats > 0 ? (
                <span>{tx(locale, `${entry.openSeats} posisi terbuka`, entry.openSeats === 1 ? "1 open seat" : `${entry.openSeats} open seats`)}</span>
              ) : null}
              {entry.activeAt ? (
                <span>
                  {tx(locale, "Aktif ", "Active ")}
                  <RelativeTime value={entry.activeAt} locale={locale} />
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {/* The roles column is the role path's only; on the code path the
          language sits in the card's meta line instead. */}
      {code ? null : (
        <div className="dx-cell-meta" role="cell">
          {/* A product asking for nothing has no chips, and no label to explain them. */}
          {entry.labels.length > 0 ? (
            <span className="dx-roles">
              {/* The column header says this on a wide table; a stacked card
                  has no header, so the chips would otherwise be unexplained. */}
              <span className="dx-roles-label">{tx(locale, "Mencari:", "Looking for:")}</span>
              {entry.labels.slice(0, 2).map((label) => <span key={label} className="dx-role">{label}</span>)}
              {entry.labels.length > 2 ? <span className="dx-muted">+{entry.labels.length - 2}</span> : null}
            </span>
          ) : null}
        </div>
      )}

      <div className="dx-cell-action" role="cell">
        {/* On the code path the row ends like a GitHub search result: a Star,
            which opens the repo on GitHub. Elsewhere, the way in. */}
        {code && entry.repo ? (
          <StarLink repo={entry.repo} />
        ) : entry.external ? (
          <a className="dx-action" href={entry.actionHref} {...external}>
            {tx(locale, "Repo", "Repo")} <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <Link className="dx-action" href={entry.actionHref}>
            {entry.hasOpenRoles ? tx(locale, "Ajukan diri", "Offer to help") : tx(locale, "Lihat produk", "See the product")}{" "}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

/** ContribReady, opened beside the directory rather than in its place. */
function ContribReadyLink() {
  return (
    <a href={contribReadyUrl} target="_blank" rel="noopener noreferrer">
      ContribReady <span aria-hidden="true">↗</span>
    </a>
  );
}
