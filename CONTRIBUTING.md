# Contributing

Thank you for helping make builders.swegrowth.id and oss.swegrowth.id better. Contributions can be code,
tests, documentation, design feedback, bug reports, or feature ideas. English
and Indonesian are both welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md),
not in an issue or public pull request.

## Before you start

- Search the existing issues and pull requests before opening a new one.
- For a bug, include a small reproduction and the expected and actual behavior.
- For a substantial feature, schema change, or redesign, open an issue first so
  the direction can be agreed before a large amount of work is done.
- Keep a pull request focused on one concern. Small changes are easier to review
  and safer to ship.

You do not need repository write access. Fork the repository, create a branch in
your fork, and open a pull request against `develop`. `main` is what is
deployed; maintainers merge `develop` into it.

## Local setup

Requirements:

- Node.js 22.13 or newer
- npm (the lockfile is committed)
- A Supabase project only when working on authentication or persisted data

```bash
git clone https://github.com/YOUR-USERNAME/builders.git
cd builders
npm ci
cp .env.example .env.local
npm run dev                        # the builders site
NEXT_PUBLIC_SITE=oss npm run dev   # the open source site
```

The app works in read-only seed mode without Supabase credentials. See the main
[README](README.md) for complete Supabase and PostgreSQL policy-test setup.

## Making a change

1. Branch from the latest `develop`, using a short descriptive name such as
   `fix/mobile-project-card`.
2. Match the existing TypeScript and UI patterns. A change that only one of
   the two sites should see goes behind `isOss` from `app/lib/site.ts`. Keep authorization in
   Supabase row-level security; server-action checks only improve error messages.
3. Add or update tests for changed behavior.
4. Update documentation when setup, behavior, routes, or configuration changes.
5. Run the checks that CI will run:

   ```bash
   npm run lint
   npm test                             # builds builders, runs the tests
   NEXT_PUBLIC_SITE=oss npx next build  # and the open source site
   ```

6. Open a pull request and complete its checklist. Link the relevant issue with
   `Closes #123` when appropriate.

## Database changes

- Do not rewrite a migration that may already have been applied. Add the next
  numbered file under `supabase/migrations/`. The one exception already in
  place: wrapping a pg_cron/pg_net statement in an availability guard changes
  nothing where the extension exists, so those guards are added in place
  rather than as a new file.
- Treat row-level security changes as security-sensitive. Add cases to
  `supabase/tests/policies.sql` for allowed and denied operations.
- Test migrations against a scratch PostgreSQL database using the commands in
  the README. Never run `supabase/local/auth-shim.sql` against hosted Supabase.
- Never add a Supabase `service_role` key to this application, tests, examples,
  issues, or CI. The browser-facing anonymous key is protected by RLS; the
  service role bypasses it.

## Review and acceptance

A maintainer may ask for changes to keep the product coherent, secure, and
maintainable. CI must pass and review conversations must be resolved before a
pull request is merged. A pull request may be declined even when technically
sound if it does not fit the project's current direction; maintainers will aim
to explain why.

Unless stated otherwise, contributions accepted into this repository are
licensed under the repository's [MIT License](LICENSE).
