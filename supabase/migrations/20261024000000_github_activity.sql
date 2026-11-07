-- What members have been doing in open source, for the /activity page: their
-- pull requests to other people's repositories, one row each, and a single
-- commit summary for their own repositories.
--
-- Read from GitHub by the refresh-github-activity Edge Function, never typed
-- in: the function writes with the service role, and neither table grants a
-- signed-in member any write. It runs every six hours, and at once when
-- somebody changes the GitHub account on their profile.
--
-- Before the schedule does anything, deploy the function with the same two
-- secrets as refresh-repos (GITHUB_TOKEN and REFRESH_SECRET):
--
--   supabase functions deploy refresh-github-activity --no-verify-jwt
--
-- It reuses the Vault secrets 20261022000100_refresh_repo_signals.sql asks
-- for (project_url, refresh_repos_secret). Until those exist every call below
-- quietly does nothing, so this migration is safe to apply first.
--
-- Everybody with a GitHub account on their profile is shown. Somebody who
-- would rather not be unticks it on their profile, which adds
-- 'github_activity' to profiles.activity_hidden; the read policies below hide
-- their rows from that moment, without waiting for the next refresh.

create table public.github_pull_requests (
  url        text        primary key,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  repo       text        not null,
  number     integer     not null,
  title      text        not null default '',
  state      text        not null,
  opened_at  timestamptz not null,
  merged_at  timestamptz,
  checked_at timestamptz not null default now(),
  constraint github_pull_requests_url check (url like 'https://github.com/%'),
  constraint github_pull_requests_repo_shape check (
    repo = lower(repo)
    and repo ~ '^[a-z0-9](?:[a-z0-9-]{0,38})/[a-z0-9._-]{1,100}$'
  ),
  constraint github_pull_requests_state check (state in ('open', 'merged')),
  constraint github_pull_requests_merged check ((state = 'merged') = (merged_at is not null))
);

create index github_pull_requests_user on public.github_pull_requests (user_id);
create index github_pull_requests_recent on public.github_pull_requests ((coalesce(merged_at, opened_at)) desc);

comment on table public.github_pull_requests is
  'Members'' open and recently merged pull requests to repositories they do not own; written only by the refresh-github-activity Edge Function.';

create table public.github_commit_summaries (
  user_id        uuid        primary key references public.profiles (id) on delete cascade,
  commits        integer     not null check (commits > 0),
  -- [{"repo": "owner/name", "commits": 12}, ...], most commits first.
  repos          jsonb       not null default '[]'::jsonb,
  last_commit_at timestamptz,
  since          date        not null,
  checked_at     timestamptz not null default now()
);

comment on table public.github_commit_summaries is
  'Commits each member made to their own public repositories since `since`; written only by the refresh-github-activity Edge Function.';

-- A kind somebody can keep off the page. Respelled in full, as every change
-- to this CHECK has been; see 0010_showcase.sql.
alter table public.profiles drop constraint profiles_activity_hidden_valid;
alter table public.profiles add constraint profiles_activity_hidden_valid check (
  activity_hidden <@ array[
    'project_created', 'project_stage_changed', 'seat_opened', 'seat_applied',
    'seat_filled', 'task_created', 'task_taken', 'task_done',
    'comment_posted', 'boost_given', 'update_posted', 'github_activity']::text[]
);

alter table public.github_pull_requests enable row level security;
alter table public.github_commit_summaries enable row level security;

create policy "github pull requests are public unless hidden"
  on public.github_pull_requests for select
  to anon, authenticated
  using (not exists (
    select 1 from public.profiles p
    where p.id = user_id and 'github_activity' = any (p.activity_hidden)
  ));

create policy "github commit summaries are public unless hidden"
  on public.github_commit_summaries for select
  to anon, authenticated
  using (not exists (
    select 1 from public.profiles p
    where p.id = user_id and 'github_activity' = any (p.activity_hidden)
  ));

grant select on public.github_pull_requests to anon, authenticated;
grant select on public.github_commit_summaries to anon, authenticated;

-- ------------------------------------------------------------------ refresh

/*
 * Ask the Edge Function to refresh `users`, or everybody when it is null.
 * Fire and forget, like private.request_repo_refresh: any failure is a
 * warning, never an error, because this runs inside a member's own profile
 * save.
 */
create or replace function private.request_github_activity_refresh(users uuid[] default null)
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
    url := rtrim(base_url, '/') || '/functions/v1/refresh-github-activity',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-refresh-secret', secret),
    body := case when users is null then '{}'::jsonb else jsonb_build_object('users', to_jsonb(users)) end,
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning 'github activity refresh request failed: %', sqlerrm;
end;
$$;

revoke all on function private.request_github_activity_refresh(uuid[]) from public, anon, authenticated;

create or replace function private.refresh_profile_github()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.github is distinct from old.github then
    perform private.request_github_activity_refresh(array[new.id]);
  end if;
  return null;
end;
$$;

create trigger refresh_github_activity
  after update of github on public.profiles
  for each row execute function private.refresh_profile_github();

-- Every six hours, half an hour after refresh-repo-signals so the two do not
-- share the GitHub token's rate limit in the same minute.
select cron.schedule('refresh-github-activity', '47 */6 * * *', $$ select private.request_github_activity_refresh(null) $$);
