-- The smallest slice of Supabase's auth schema that the migrations and the RLS
-- policies actually touch, so a plain PostgreSQL 16 can run them.
--
-- Development and test only. A hosted Supabase project already has all of this,
-- and a much larger auth schema besides — never run this file against one.

create schema if not exists auth;

-- Supabase keeps extensions out of `public`, and 20260829032113 installs
-- pg_trgm there by name. A plain PostgreSQL has no such schema, so the
-- migrations stop dead without this line.
create schema if not exists extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- The accounts a user signs in with: one row per provider, as GoTrue keeps
-- them. 20261103000000 reads the GitHub one to know a member's verified handle.
create table if not exists auth.identities (
  id            uuid        primary key default gen_random_uuid(),
  provider_id   text        not null,
  user_id       uuid        not null references auth.users (id) on delete cascade,
  identity_data jsonb       not null default '{}'::jsonb,
  provider      text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (provider_id, provider)
);

-- Supabase reads the caller's identity out of the request's JWT claims, which
-- PostgREST puts on the connection as a setting. Same contract here.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

grant usage on schema auth, extensions to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
