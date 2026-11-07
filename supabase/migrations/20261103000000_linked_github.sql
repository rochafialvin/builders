-- A member's GitHub account is the one they linked, never one they typed.
--
-- Until now profiles.github was free text: anybody could enter `torvalds`,
-- say yes to /activity, and have Linus's pull requests shown as theirs — on
-- the feed, the ranking, the directory's faces and its "verified" marks, and
-- the repos suggested to the catalogue. All of those read profiles.github, so
-- the fix is at the source (#209):
--
--   - profiles.github is written only from auth.identities, by a trigger, when
--     a GitHub account is linked through OAuth (signing in with GitHub links
--     one too). Members can no longer write it.
--   - profiles.github_id keeps GitHub's numeric user id. A login can be
--     renamed and later taken by somebody else; the id never moves, so
--     refresh-github-activity checks it before it attributes anything.
--   - A handle typed before this, with no account linked behind it, is moved
--     to profiles.github_typed — kept, so the editor can say what to link, but
--     read by nothing else. Its activity stops being gathered, and the next
--     refresh clears what was stored for it.
--
-- And a username equal to a linked GitHub handle belongs to whoever linked it:
-- nobody else may take it, at sign-up or later.

create schema if not exists private;

alter table public.profiles
  add column github_id    bigint,
  add column github_typed text not null default '';

create unique index profiles_github_id_key on public.profiles (github_id) where github_id is not null;

comment on column public.profiles.github is
  'https://github.com/<login> of the GitHub account linked through OAuth, or empty. Written only by private.sync_github_identity.';
comment on column public.profiles.github_id is
  'GitHub''s numeric user id of the linked account; stable across renames. Null when none is linked.';
comment on column public.profiles.github_typed is
  'A GitHub handle the member typed before accounts had to be linked. Shown to them alone, as what to link; trusted by nothing.';

-- ------------------------------------------------------------- the sync

-- Keeps profiles.github and github_id in step with the linked GitHub identity:
-- set when one is linked (or its login changes at a later sign-in), cleared
-- when it is unlinked. Unlinking also takes back the yes to /activity, since
-- there is no account left for it to be about.
create or replace function private.sync_github_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  login text;
begin
  if tg_op = 'DELETE' then
    if old.provider = 'github' then
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

  update public.profiles
  set github = 'https://github.com/' || login, github_id = new.provider_id::bigint, github_typed = ''
  where id = new.user_id;
  return new;
end;
$$;

revoke all on function private.sync_github_identity() from public, anon, authenticated;

create trigger sync_github_identity
  after insert or update or delete on auth.identities
  for each row execute function private.sync_github_identity();

-- ------------------------------------------------------------- what is there now

-- Whatever was typed is kept aside first, then the linked accounts are written
-- in, and what is left unlinked is cleared from the column everything reads.
update public.profiles set github_typed = github where github <> '';

update public.profiles p
set github       = 'https://github.com/' || (i.identity_data ->> 'user_name'),
    github_id    = i.provider_id::bigint,
    github_typed = ''
from auth.identities i
where i.user_id = p.id
  and i.provider = 'github'
  and i.provider_id ~ '^[0-9]+$'
  and (i.identity_data ->> 'user_name') ~* '^[a-z0-9][a-z0-9-]{0,38}$';

update public.profiles set github = '' where github_id is null and github <> '';

-- Members write neither: 20261102000000 granted `github` with the editor's
-- columns, and the two new ones were never granted.
revoke update (github) on public.profiles from authenticated;

-- ------------------------------------------------------------- usernames

-- Whether `login` is the login of a GitHub account some member other than
-- `self_id` has linked. Such a name is theirs: /u/<their handle> must not be
-- somebody else. (Not `name`: profiles has a column by that name, and inside
-- the query it would win over the parameter.)
create or replace function private.is_linked_github_login(login text, self_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.github_id is not null
      and lower(p.github) = 'https://github.com/' || lower(login)
      and p.id is distinct from self_id
  );
$$;

revoke all on function private.is_linked_github_login(text, uuid) from public, anon, authenticated;

-- Sign-up skips another member's linked GitHub handle too.
create or replace function public.available_username(seed text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base      text;
  candidate text;
  suffix    int := 1;
begin
  base := lower(split_part(coalesce(seed, ''), '@', 1));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);
  base := left(base, 40);

  -- The username format check wants at least two characters, starting with a
  -- letter or digit. Anything that shrank away falls back to a generic stem.
  if char_length(base) < 2 or base !~ '^[a-z0-9]' then
    base := 'orang';
  end if;

  candidate := base;
  while exists (select 1 from public.profiles p where p.username = candidate)
     or exists (select 1 from public.username_history h where h.username = candidate)
     or public.is_reserved_username(candidate)
     or private.is_linked_github_login(candidate, null) loop
    suffix    := suffix + 1;
    candidate := base || '-' || suffix;
  end loop;

  return candidate;
end;
$$;

revoke all on function public.available_username(text) from public, anon, authenticated;

-- As in 20261102000000, plus one rule: another member's linked GitHub handle
-- is refused.
create or replace function public.change_username(new_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller       uuid := auth.uid();
  candidate    text := lower(trim(coalesce(new_name, '')));
  current_name text;
  last_changed timestamptz;
begin
  if caller is null then
    raise exception 'Masuk dulu untuk mengubah username.' using errcode = '42501';
  end if;

  if candidate !~ '^[a-z0-9][a-z0-9-]{1,47}$' then
    raise exception 'Username harus 2 sampai 48 karakter: huruf kecil, angka atau tanda hubung, diawali huruf atau angka.' using errcode = '22023';
  end if;

  if public.is_reserved_username(candidate) then
    raise exception 'Username itu dipakai oleh sistem.' using errcode = '23505';
  end if;

  -- Locked, so two changes sent at once queue up: the second sees the first's
  -- name and cooldown instead of both passing and one name going unrecorded.
  select p.username, p.username_changed_at into current_name, last_changed
  from public.profiles p where p.id = caller
  for update;

  -- Nothing to do, and no cooldown spent on a no-op.
  if current_name = candidate then
    return candidate;
  end if;

  if last_changed is not null and last_changed > now() - interval '30 days' then
    -- Its own code: 22023 above is the format, and the app tells them apart.
    raise exception 'Username baru bisa diubah lagi 30 hari setelah perubahan terakhir.' using errcode = '55000';
  end if;

  if exists (select 1 from public.profiles p where p.username = candidate and p.id <> caller) then
    raise exception 'Username itu sudah dipakai.' using errcode = '23505';
  end if;
  if exists (select 1 from public.username_history h where h.username = candidate and h.user_id <> caller) then
    raise exception 'Username itu sudah pernah dipakai orang lain.' using errcode = '23505';
  end if;
  if private.is_linked_github_login(candidate, caller) then
    raise exception 'Username itu adalah akun GitHub member lain.' using errcode = '23505', hint = 'github_login';
  end if;

  -- Keep the name being left behind so its links still resolve. on conflict
  -- covers a member who reclaims then retires a name again.
  insert into public.username_history (username, user_id)
  values (current_name, caller)
  on conflict (username) do update set user_id = excluded.user_id, changed_at = now();

  update public.profiles
  set username = candidate, username_changed_at = now()
  where id = caller;

  -- If the new name was this member's own former name, it is live again, so it
  -- must not sit in history redirecting to itself.
  delete from public.username_history where username = candidate and user_id = caller;

  return candidate;
end;
$$;

revoke all     on function public.change_username(text) from public, anon;
grant  execute on function public.change_username(text) to authenticated;
