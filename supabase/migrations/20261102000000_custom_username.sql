-- Lets a member choose their own /u/<username>, closes direct writes to it.
--
-- Until now the username was system-assigned (available_username in 0002) and
-- the editor said it could not be changed. Two problems came with that:
--
--   1. The table-wide `update` grant in 0003 plus a row-only policy meant any
--      member could still PATCH their own `username` straight through the API
--      with the public anon key, skipping the format rule and the reserved
--      names, so "cannot be changed" held only in the UI.
--   2. People want /u/<github-handle> or a name they pick, not budi-2.
--
-- So: a change goes through one security-definer function that enforces the
-- format, a reserved list, availability and a cooldown; the column loses its
-- direct `update` grant; and every former name is kept so its links 308 to
-- the current one.

-- --------------------------------------------------------------- former names

-- Every username a member has left behind, so /u/<old> can still find them.
-- The primary key is the name itself: a released name is kept on the row of
-- whoever last held it, and cannot be handed to anyone else while it sits here.
create table public.username_history (
  username   text        primary key,
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  changed_at timestamptz not null default now(),

  constraint username_history_format check (username ~ '^[a-z0-9][a-z0-9-]{1,47}$')
);

create index username_history_user on public.username_history (user_id);

comment on table public.username_history is
  'Former usernames, kept so old /u/<name> links 308 to the holder''s current name. Written only by public.change_username.';

-- When the last change happened, so a cooldown can be enforced. Null means the
-- name is still the system-assigned one, so the first change is always allowed.
alter table public.profiles add column username_changed_at timestamptz;

-- ------------------------------------------------------- sign-up seed

-- Seed a new member's username from their GitHub handle when they have one.
--
-- The OSS site signs people in with GitHub, and GoTrue puts the login in
-- raw_user_meta_data.user_name. Seeding from it means a member starts at
-- /u/<handle> instead of a name-derived guess like fajar-hidayat, which is the
-- whole reason people asked. available_username still settles the format and
-- any clash, and change_username lets them pick something else later. Only new
-- sign-ups are affected; existing members keep their current name until they
-- change it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name text;
  seed         text;
begin
  display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
  display_name := coalesce(display_name, split_part(new.email, '@', 1));

  seed := coalesce(
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'user_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'preferred_username', '')), ''),
    display_name,
    new.email
  );

  insert into public.profiles (id, username, name)
  values (new.id, public.available_username(seed), left(display_name, 80));

  return new;
end;
$$;

-- --------------------------------------------------------------- reserved list

-- Names that are site routes or would be confusing as a profile. Mirrored in
-- app/lib/profile.ts (RESERVED_USERNAMES); keep the two in step.
create or replace function public.is_reserved_username(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(name) in (
    'about', 'account', 'activity', 'admin', 'api', 'auth', 'community',
    'dashboard', 'directory', 'explore', 'feedback', 'forgot-password',
    'get-started', 'help', 'how-it-works', 'inbox', 'leaderboard', 'login',
    'logout', 'me', 'new', 'people', 'privacy', 'profile', 'projects',
    'recommend', 'register', 'search', 'settings', 'signin', 'signup',
    'submit', 'support', 'terms', 'u'
  );
$$;

revoke all on function public.is_reserved_username(text) from public, anon, authenticated;

-- Sign-up hands out neither a name another member has retired nor a reserved
-- one. Both matter more now that the seed is a GitHub handle: a new member
-- whose handle is somebody's former name would otherwise take over every link
-- shared to the old one, and a handle like `admin` would get /u/admin.
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
     or public.is_reserved_username(candidate) loop
    suffix    := suffix + 1;
    candidate := base || '-' || suffix;
  end loop;

  return candidate;
end;
$$;

revoke all on function public.available_username(text) from public, anon, authenticated;

-- --------------------------------------------------------------- the change

-- Changes the caller's own username, or raises a reason it cannot.
--
-- A function rather than a plain UPDATE policy because the allowed change is
-- narrow and stateful: the format and reserved rules, a cooldown, a uniqueness
-- that must also exclude names other people have retired, and the bookkeeping
-- that keeps the old name pointing here. None of that fits a with-check.
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

  -- ponytail: fixed 30-day cooldown, a column not a table. Move it to config
  -- if the number ever needs to differ per member.
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

-- --------------------------------------------------------------- grants / RLS

alter table public.username_history enable row level security;

-- Public, because the /u/<old> redirect is read with the anon key. Writes come
-- only from change_username, which runs as the owner, so no write grant here.
create policy "username history is public"
  on public.username_history for select
  to anon, authenticated
  using (true);

grant select on public.username_history to anon, authenticated;

-- Close the direct write. 0003 granted table-wide update, so a member could
-- set username (and created_at) straight through the API. Scope it to the
-- columns the editor actually writes, the way notices.seen is already scoped.
-- username now moves only through change_username; id, created_at and
-- username_changed_at are system-kept.
revoke update on public.profiles from authenticated;
grant update (
  name, headline, bio, website, github, activity_hidden, profession, skills,
  fields, public_email, linkedin, x_url, availability_status, years_experience,
  resume_url, github_activity_shown
) on public.profiles to authenticated;
