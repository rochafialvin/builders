-- Switching the linked GitHub account, instead of unlinking it.
--
-- A member who signs in with GitHub cannot be left without it, so the profile
-- offers "switch account": the new GitHub account is linked next to the old
-- one, then the old one is unlinked (app/auth/callback/route.ts). For a moment
-- the member has two GitHub identities, and 20261103000000's trigger read
-- every change to either as the one: deleting the old identity cleared the
-- new account it had just written.
--
-- Now the identity in profiles.github_id is the one that counts:
--
--   - linking one (insert) always makes it the account: it is the newest;
--   - a later sign-in refreshing one (update) syncs it only if it is the
--     account, so the old one cannot take back its place;
--   - removing one (delete) touches the profile only if it was the account,
--     and then falls back to another GitHub identity left, if any. With none
--     left the account is cleared, and the yes to /activity with it.

create or replace function private.sync_github_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  login     text;
  linked_id bigint;
  remaining auth.identities%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.provider <> 'github' then
      return old;
    end if;
    select p.github_id into linked_id from public.profiles p where p.id = old.user_id;
    if linked_id is distinct from (case when old.provider_id ~ '^[0-9]+$' then old.provider_id::bigint end) then
      return old;
    end if;

    select * into remaining
    from auth.identities i
    where i.user_id = old.user_id
      and i.provider = 'github'
      and i.id <> old.id
      and i.provider_id ~ '^[0-9]+$'
      and (i.identity_data ->> 'user_name') ~* '^[a-z0-9][a-z0-9-]{0,38}$'
    order by i.created_at desc
    limit 1;

    if found then
      update public.profiles
      set github = 'https://github.com/' || (remaining.identity_data ->> 'user_name'), github_id = remaining.provider_id::bigint
      where id = old.user_id;
    else
      update public.profiles
      set github = '', github_id = null, github_activity_shown = false
      where id = old.user_id;
    end if;
    return old;
  end if;

  if new.provider <> 'github' or new.provider_id !~ '^[0-9]+$' then
    return new;
  end if;
  login := new.identity_data ->> 'user_name';
  if login is null or login !~* '^[a-z0-9][a-z0-9-]{0,38}$' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select p.github_id into linked_id from public.profiles p where p.id = new.user_id;
    if linked_id is not null and linked_id <> new.provider_id::bigint then
      return new;
    end if;
  end if;

  update public.profiles
  set github = 'https://github.com/' || login, github_id = new.provider_id::bigint, github_typed = ''
  where id = new.user_id;
  return new;
end;
$$;

revoke all on function private.sync_github_identity() from public, anon, authenticated;
