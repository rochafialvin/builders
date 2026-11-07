# Changelog

Releases are versioned from `v0.1.0` while the site is still settling: until
`v1.0.0`, a minor version may break things. The `v1.0.0`–`v1.4.1` releases
below were published before that and their tags were removed; their notes are
kept here. New releases and their notes are on
[GitHub Releases](https://github.com/swegrowthid/builders/releases).

## Before 0.x

### v1.4.1
_2026-10-29_

#### Other changes
* Release: Weeks of contribution leaderboard by @zikrulihsan in https://github.com/swegrowthid/builders/pull/231

### v1.4.0
_2026-10-28_

#### Features
* Rank the leaderboard by consistency: one PR a week by @zikrulihsan in https://github.com/swegrowthid/builders/pull/225
#### Other changes
* Test the rendered pages and cross-site redirects of both sites by @carissafarry in https://github.com/swegrowthid/builders/pull/227
* perf(config): stop inlining the stylesheet into every page by @arifintahu in https://github.com/swegrowthid/builders/pull/228
* Develop by @zikrulihsan in https://github.com/swegrowthid/builders/pull/229

#### New contributors
* @carissafarry made their first contribution in https://github.com/swegrowthid/builders/pull/227
* @arifintahu made their first contribution in https://github.com/swegrowthid/builders/pull/228

### v1.3.1
_2026-10-28_

#### Fixes
* Don't count a repository's own author as an outside contributor by @zikrulihsan in https://github.com/swegrowthid/builders/pull/222
* Count PRs to a member's own one-person repos as own work, not contributions by @zikrulihsan in https://github.com/swegrowthid/builders/pull/223
#### Other changes
* Keep the select popup list on the page's colours by @fajarwz in https://github.com/swegrowthid/builders/pull/216
* Develop by @zikrulihsan in https://github.com/swegrowthid/builders/pull/224

#### New contributors
* @fajarwz made their first contribution in https://github.com/swegrowthid/builders/pull/216

### v1.3.0
_2026-10-28_

#### Features
* Show the GitHub profile README as a profile's description by @zikrulihsan in https://github.com/swegrowthid/builders/pull/220
#### Fixes
* Switch the GitHub account instead of unlinking; say why linking failed by @zikrulihsan in https://github.com/swegrowthid/builders/pull/219
#### Other changes
* Develop by @zikrulihsan in https://github.com/swegrowthid/builders/pull/221

### v1.2.0
_2026-10-28_

#### Features
* GitHub only through a linked account: verified activity, badges and handle-usernames by @zikrulihsan in https://github.com/swegrowthid/builders/pull/213
* Sign in with GitHub, or Google one click away; passwords are hidden by @zikrulihsan in https://github.com/swegrowthid/builders/pull/214
* A profile is a summary of open source work, read from GitHub by @zikrulihsan in https://github.com/swegrowthid/builders/pull/215
#### Other changes
* Linked GitHub by @zikrulihsan in https://github.com/swegrowthid/builders/pull/217
* Develop by @zikrulihsan in https://github.com/swegrowthid/builders/pull/218

### v1.1.0
_2026-10-27_

#### Features
* Let members choose their own profile username by @fajarhide in https://github.com/swegrowthid/builders/pull/208
#### Other changes
* Every deploy to main gets a semver GitHub release by @zikrulihsan in https://github.com/swegrowthid/builders/pull/210
* Merge pull request #210 from swegrowthid/release-on-main by @zikrulihsan in https://github.com/swegrowthid/builders/pull/212

#### New contributors
* @fajarhide made their first contribution in https://github.com/swegrowthid/builders/pull/208

### v1.0.0 — First public release
_2026-10-27_

The first tagged release of the swegrowth community sites, **[builders.swegrowth.id](https://builders.swegrowth.id)** and **[oss.swegrowth.id](https://oss.swegrowth.id)**, both served from this one codebase. It covers everything that has shipped to `main` so far. From here on, every deploy to `main` gets its own release with the pull requests it brings.

## Two sites, one codebase

- **oss.swegrowth.id** is for open source contributors. It covers members' GitHub activity, a curated repo directory, and the community around them.
- **builders.swegrowth.id** is for members building products. It covers their products, the roles they need help with, and a feed of what they ship.
- The site is chosen at build time with `NEXT_PUBLIC_SITE`. Both share one Supabase database, where row-level security decides who may write what.

## Open source site

- **Activity is the home page.** Members' merged pull requests and commit summaries come from GitHub every 30 minutes, opt-in only. Members can react with emoji, and filters separate local from global repos and contributions from a member's own work.
- **Ranking:** this month's or this week's merged PRs, beside the feed. `/leaderboard`, with points, streaks and badges, is coming soon. Ideas are welcome on #186.
- **"Repo tujuan PR":** where the community's pull requests land, with faces and the last time.
- **Directory (`/directory`):** curated repos from members' projects to global ones, newest first. It has Local / Global, search, sort and admin picks, credits who shared each repo, and shows badges for members who have contributed. For more global repos it points to [ContribReady](https://contrib.idnremote.com).
- **Profiles (`/u/<username>`):** a member's open source record, products and trail, with a share card.

## Builders site

- A directory of members' products, with what each one is and the help it is looking for.
- Adding a product takes one page, starting from a link or a GitHub README.
- A product activity feed, with reactions.

## Community and accounts

- **`/community`:** what the WhatsApp group is for, and its house rules. The group is open to everyone.
- **About, How it works, Get started, and Privacy** pages.
- **Sign in** with GitHub or Google.
- **Feedback** becomes a prefilled GitHub issue.
- Indonesian and English throughout, plus light and dark themes.
- **On phones:** a bottom bar that stays put and responds to a tap straight away.

## Under the hood

- Next.js 16 with cached public reads, prerendered pages and streamed loading states.
- Supabase Auth and Postgres, with policies tested in `supabase/tests/policies.sql`.
- Deployed on Netlify. The Turbopack filesystem cache is off, since it once shipped a stale stylesheet (#200).
- CI lints, builds and tests both sites.

## Thank you

Thanks to the community members who contributed to this release:

- @rochafialvin: replaced the remaining old internal names (#180)
- @andihaki: fixed the footer at 1025px (#181)
- @ahrezaldy: feedback now becomes a prefilled GitHub issue, which closes a spam hole (#182)

Want to help? Read [CONTRIBUTING.md](https://github.com/swegrowthid/builders/blob/main/CONTRIBUTING.md) and pick an issue labelled `help wanted`.
