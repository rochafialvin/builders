-- Repositories a member keeps off the site: `owner/name`, or `owner/*` for
-- everything under one account or organisation.
--
-- Only its owner reads the list: which repositories somebody hides is itself
-- something not to show. Hiding one clears what was stored for it at once;
-- refresh-github-activity skips it from then on. Showing it again asks the
-- function to fetch it back.

create table public.github_hidden_repos (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pattern text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, pattern),
  constraint github_hidden_repos_shape check (
    pattern = lower(pattern)
    and pattern ~ '^[a-z0-9](?:[a-z0-9-]{0,38})/(?:[a-z0-9._-]{1,100}|\*)$'
  )
);

comment on table public.github_hidden_repos is
  'Repositories (owner/name, or owner/* for a whole owner) a member keeps off /activity, the leaderboard and their badges. Readable by its owner only.';

alter table public.github_hidden_repos enable row level security;

create policy "a member reads their own hidden repositories"
  on public.github_hidden_repos for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "a member hides a repository"
  on public.github_hidden_repos for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select count(*) from public.github_hidden_repos h where h.user_id = (select auth.uid())) < 200
  );

create policy "a member shows a repository again"
  on public.github_hidden_repos for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.github_hidden_repos to authenticated;

create or replace function private.github_repo_hidden(pattern text, repo text)
returns boolean
language sql
immutable
as $$
  select pattern = repo
    or (right(pattern, 2) = '/*' and split_part(repo, '/', 1) = split_part(pattern, '/', 1));
$$;

create or replace function private.forget_hidden_github_repo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    delete from public.github_pull_requests
      where user_id = new.user_id and private.github_repo_hidden(new.pattern, repo);
    delete from public.github_contributions
      where user_id = new.user_id and private.github_repo_hidden(new.pattern, repo);

    update public.github_commit_summaries s
      set repos = kept.repos, commits = kept.commits
      from (
        select coalesce(jsonb_agg(entry order by ord), '[]'::jsonb) as repos,
               coalesce(sum((entry ->> 'commits')::int), 0) as commits
        from public.github_commit_summaries own,
             jsonb_array_elements(own.repos) with ordinality as e(entry, ord)
        where own.user_id = new.user_id
          and not private.github_repo_hidden(new.pattern, entry ->> 'repo')
      ) kept
      where s.user_id = new.user_id and kept.commits > 0;
    delete from public.github_commit_summaries s
      where s.user_id = new.user_id
        and not exists (
          select 1 from jsonb_array_elements(s.repos) entry
          where not private.github_repo_hidden(new.pattern, entry ->> 'repo')
        );
  else
    perform private.request_github_activity_refresh(array[old.user_id]);
  end if;
  return null;
end;
$$;

revoke all on function private.forget_hidden_github_repo() from public, anon, authenticated;

create trigger forget_hidden_github_repo
  after insert or delete on public.github_hidden_repos
  for each row execute function private.forget_hidden_github_repo();
