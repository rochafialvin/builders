-- Keeps public.repo_signals current by calling the refresh-repos Edge Function
-- from the database: every six hours on a schedule, and at once when a
-- repository is listed, re-linked or opened to pull requests.
--
-- Before running this, deploy the function and put two secrets in Vault
-- (Dashboard → Project Settings → Vault, or the SQL editor):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as the function''s REFRESH_SECRET>', 'refresh_repos_secret');
--
-- Until both exist every call below quietly does nothing, so this migration is
-- safe to apply first; nothing a member does can fail because of it.

-- pg_net and pg_cron exist only on Supabase. On a plain PostgreSQL (the
-- README test run and CI) they are absent, so the setup is guarded and
-- skipped there; where they exist this does exactly what it did before.
do $guard$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end
$guard$;

create schema if not exists private;
revoke all on schema private from public;

/*
 * Ask the Edge Function to refresh `repos`, or every stale listed repository
 * when it is null. Fire and forget: pg_net queues the request and returns, and
 * the function answers 202 before doing any work.
 *
 * SECURITY DEFINER to read Vault; never callable from the API, since it lives
 * in `private` and execute is revoked. Any failure is a warning, never an
 * error — this runs inside members' own writes, through the triggers below.
 */
create or replace function private.request_repo_refresh(repos text[] default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_url text;
  secret   text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'refresh_repos_secret';
  if base_url is null or secret is null then
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/functions/v1/refresh-repos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-refresh-secret', secret),
    body := case when repos is null then '{}'::jsonb else jsonb_build_object('repos', to_jsonb(repos)) end,
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning 'repo refresh request failed: %', sqlerrm;
end;
$$;

revoke all on function private.request_repo_refresh(text[]) from public, anon, authenticated;

/*
 * A project's GitHub repository as a repo_signals key, or null. The same
 * narrow rule as the app's parseGitHubRepositoryUrl: https, github.com,
 * exactly owner/name, an optional `.git`.
 */
create or replace function private.github_repo_key(url text)
returns text
language sql
immutable
as $$
  select lower(m[1] || '/' || m[2])
  from regexp_match(btrim(url), '^https://(?:www\.)?github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$', 'i') as m;
$$;

create or replace function private.refresh_project_repo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  key text := private.github_repo_key(new.repo_url);
begin
  if key is not null and (
    tg_op = 'INSERT'
    or new.repo_url is distinct from old.repo_url
    or new.open_for_github_contributions is distinct from old.open_for_github_contributions
  ) then
    perform private.request_repo_refresh(array[key]);
  end if;
  return null;
end;
$$;

create trigger refresh_repo_signals
  after insert or update of repo_url, open_for_github_contributions on public.projects
  for each row execute function private.refresh_project_repo();

create or replace function private.refresh_catalogue_repo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform private.request_repo_refresh(array[new.repo]);
  end if;
  return null;
end;
$$;

create trigger refresh_repo_signals
  after insert or update of status on public.oss_repos
  for each row execute function private.refresh_catalogue_repo();

-- Every six hours, at an odd minute so it does not land with everybody else's
-- jobs on the hour. The function itself skips rows checked in the last six.
do $guard$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-repo-signals', '17 */6 * * *', $$ select private.request_repo_refresh(null) $$);
  end if;
end
$guard$;
