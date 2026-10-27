-- Checks that the row level security policies actually hold.
--
-- Run against a scratch database built from supabase/local/auth-shim.sql and
-- the files in supabase/migrations/ — never against real data, it writes rows.
-- Any violated expectation raises, so psql -v ON_ERROR_STOP=1 exits non-zero.
--
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/tests/policies.sql

\set ON_ERROR_STOP on

create schema if not exists checks;

-- Runs a statement and fails the test if it was allowed through.
create or replace function checks.denied(statement text, label text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    raise notice 'ok, ditolak: %  (%)', label, sqlerrm;
    return;
  end;
  raise exception 'BOCOR: % seharusnya ditolak, tapi berhasil', label;
end;
$$;

-- Runs a statement and fails the test if it was blocked.
create or replace function checks.allowed(statement text, label text)
returns void language plpgsql as $$
begin
  execute statement;
  raise notice 'ok, diizinkan: %', label;
end;
$$;

create or replace function checks.equal(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'SALAH: % — dapat %, harusnya %', label, actual, expected;
  end if;
  raise notice 'ok: % = %', label, expected;
end;
$$;

-- Becomes a signed-in visitor, the same way PostgREST does it.
create or replace function checks.act_as(who uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Becomes an anonymous visitor. Dropping the role is not enough: the JWT claims
-- have to go too, or auth.uid() keeps answering with whoever acted last and the
-- guest checks below quietly stop testing anything.
create or replace function checks.act_as_guest()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
  execute 'set local role anon';
end;
$$;

-- The helpers are called while acting as anon/authenticated, so those roles
-- need to be able to reach them.
grant usage on schema checks to anon, authenticated;
grant execute on all functions in schema checks to anon, authenticated;

begin;

-- Two people sign up. The trigger gives each one a profile.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'ihsan@example.com', '{"name":"Zikrul Ihsan"}'),
  ('22222222-2222-4222-8222-222222222222', 'dina@example.com',  '{"name":"Dina Pratiwi"}'),
  -- Same display name as Dina: the username must not collide.
  ('33333333-3333-4333-8333-333333333333', 'dina2@example.com', '{"name":"Dina Pratiwi"}'),
  -- On no project at all, so "assign somebody from outside" has a real subject.
  ('44444444-4444-4444-8444-444444444444', 'budi@example.com',  '{"name":"Budi Santoso"}');

select checks.equal(
  (select username from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'dina-pratiwi', 'username dari nama');
select checks.equal(
  (select username from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
  'dina-pratiwi-2', 'username kembar dapat akhiran');

-- A proposal is reserved for people already ready to appear in the talent
-- pool: profession, a skill, and a short introduction.
update public.profiles
set profession = 'Product Designer', skills = array['Figma'], headline = 'Membuat produk yang mudah dipakai.'
where id in (
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444'
);

-- ---------------------------------------------------------------- projects --

select checks.act_as('11111111-1111-4111-8111-111111111111');

select checks.allowed($$
  insert into public.projects (slug, title, tagline, owner_id, problem, solution, audience, tags)
  values ('kelas-sore', 'Kelas Sore', 'Papan jadwal kelas tambahan gratis di kampung.',
          '11111111-1111-4111-8111-111111111111',
          repeat('m', 80), repeat('s', 80), repeat('u', 25), array['pendidikan'])
$$, 'pemilik menaruh proyeknya sendiri');

select checks.denied($$
  insert into public.projects (slug, title, tagline, owner_id, problem, solution, audience, tags)
  values ('curian', 'Curian', 'Menaruh proyek atas nama orang lain.',
          '22222222-2222-4222-8222-222222222222',
          repeat('m', 130), repeat('s', 130), repeat('u', 45), array['uji'])
$$, 'menaruh proyek atas nama orang lain');

-- Sejak 20260829130000_link_first_projects.sql, brief bukan lagi syarat masuk:
-- satu tautan sudah cukup, sisanya diisi belakangan dari halaman proyek.
select checks.allowed($$
  insert into public.projects (slug, title, owner_id, stage, live_url, highlight)
  values ('tautan-saja', 'Tautan Saja', '11111111-1111-4111-8111-111111111111',
          'live', 'https://contoh.id/', 'Yang menarik: dipakai orang tiap hari.')
$$, 'proyek yang datang cuma sebagai tautan');

select checks.denied($$
  insert into public.projects (slug, title, tagline, owner_id, stage, problem, solution, audience, tags)
  values ('ngaku-jalan', 'Ngaku Jalan', 'Mengaku sudah jalan tanpa tautan apa pun.',
          '11111111-1111-4111-8111-111111111111', 'live',
          repeat('m', 130), repeat('s', 130), repeat('u', 45), array['uji'])
$$, 'level "sudah jalan" tanpa tautan');

-- Dina cannot touch someone else's project.
select checks.act_as('22222222-2222-4222-8222-222222222222');

update public.projects set title = 'Dibajak' where slug = 'kelas-sore';
select checks.equal((select title from public.projects where slug = 'kelas-sore'),
                    'Kelas Sore', 'judul orang lain tidak berubah');

delete from public.projects where slug = 'kelas-sore';
select checks.equal((select count(*)::int from public.projects where slug = 'kelas-sore'),
                    1, 'proyek orang lain tidak terhapus');

-- ------------------------------------------------------------------- seats --

select checks.denied($$
  insert into public.seats (project_id, role, brief)
  select id, 'ui-ux-designer', 'Menyelinap membuka peran di proyek orang.'
  from public.projects where slug = 'kelas-sore'
$$, 'membuka peran di proyek orang lain');

select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.allowed($$
  insert into public.seats (project_id, role, brief)
  select id, 'ui-ux-designer', 'Menyusun tampilan jadwal mingguan.'
  from public.projects where slug = 'kelas-sore'
$$, 'pemilik membuka peran');

select checks.denied($$select public.submit_proposal(null, (select id from public.seats limit 1), 'Saya sendiri.')$$,
                     'pemilik melamar ke proyeknya sendiri');

-- Two people may propose for the same role; the role itself stays open until
-- a manager chooses one of them.
select checks.act_as('22222222-2222-4222-8222-222222222222');
select checks.allowed($$select public.submit_proposal(null, (select id from public.seats limit 1), 'Bisa 4 jam per minggu.')$$,
                      'mengajukan role yang terbuka');
select checks.equal((select status from public.seats limit 1), 'open', 'role tetap terbuka untuk proposal lain');

select checks.act_as('33333333-3333-4333-8333-333333333333');
select checks.allowed($$select public.submit_proposal(null, (select id from public.seats limit 1), 'Saya juga bisa bantu.')$$,
                      'orang kedua dapat mengajukan role yang sama');
-- What each side may read is part of the same rule: 0016 shows a person their
-- own proposals, and shows a manager every proposal on a project they run. The
-- count that proves both landed is therefore the owner's to take, not the
-- applicant's.
select checks.equal((select count(*)::int from public.proposals), 1,
                    'pelamar cuma melihat proposalnya sendiri');
select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.equal((select count(*)::int from public.proposals), 2, 'dua proposal tersimpan di satu role');
select checks.act_as('33333333-3333-4333-8333-333333333333');

-- The applicant must not be able to hand themselves the seat.
update public.seats set status = 'filled' where status = 'open';
select checks.equal((select status from public.seats limit 1), 'open', 'pelamar tidak bisa meloloskan diri sendiri');

select checks.denied($$select public.decide_proposal((select id from public.proposals where person_id = '33333333-3333-4333-8333-333333333333'), true)$$,
                     'pelamar menyetujui proposal sendiri');

-- The owner decides.
select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.allowed($$select public.decide_proposal((select id from public.proposals where person_id = '22222222-2222-4222-8222-222222222222'), true)$$,
                      'pemilik menerima proposal');
select checks.equal((select status from public.seats limit 1), 'filled', 'peran terisi');

-- ---------------------------------------------------------------- comments --

select checks.act_as('22222222-2222-4222-8222-222222222222');
select checks.denied($$
  insert into public.comments (project_id, author_id, body)
  select id, '11111111-1111-4111-8111-111111111111', 'Menulis atas nama orang lain.'
  from public.projects where slug = 'kelas-sore'
$$, 'berkomentar atas nama orang lain');

select checks.allowed($$
  insert into public.comments (project_id, author_id, body)
  select id, '22222222-2222-4222-8222-222222222222', 'Mulai dari satu RT dulu.'
  from public.projects where slug = 'kelas-sore'
$$, 'berkomentar sebagai diri sendiri');

-- ------------------------------------------------------------------ boosts --

select checks.allowed($$
  insert into public.boosts (project_id, user_id)
  select id, '22222222-2222-4222-8222-222222222222' from public.projects where slug = 'kelas-sore'
$$, 'mendukung sebagai diri sendiri');

select checks.denied($$
  insert into public.boosts (project_id, user_id)
  select id, '11111111-1111-4111-8111-111111111111' from public.projects where slug = 'kelas-sore'
$$, 'mendukung atas nama orang lain');

select checks.denied($$
  insert into public.boosts (project_id, user_id)
  select id, '22222222-2222-4222-8222-222222222222' from public.projects where slug = 'kelas-sore'
$$, 'mendukung dua kali');

delete from public.boosts where user_id = '11111111-1111-4111-8111-111111111111';
select checks.equal((select count(*)::int from public.boosts), 1, 'dukungan orang lain tidak bisa dicabut');

-- ------------------------------------------------------------ akses & tugas --

-- Dina holds a filled seat by now. Promote her, and seat dina2 as a plain
-- member, so all three levels are represented at once.
select checks.act_as('11111111-1111-4111-8111-111111111111');

update public.seats set access = 'admin' where user_id = '22222222-2222-4222-8222-222222222222';
select checks.equal((select access from public.seats where user_id = '22222222-2222-4222-8222-222222222222'),
                    'admin', 'pemilik mengangkat admin');

select checks.allowed($$
  insert into public.seats (project_id, role, brief, status, user_id)
  select id, 'researcher', 'Ngobrol ke calon pengguna.', 'filled', '33333333-3333-4333-8333-333333333333'
  from public.projects where slug = 'kelas-sore'
$$, 'pemilik mendudukkan anggota');

-- An open seat carrying the admin flag would hand over the keys the moment an
-- application is accepted.
select checks.denied($$
  insert into public.seats (project_id, role, brief, access)
  select id, 'content-writer', 'Peran terbuka yang mengaku admin.', 'admin'
  from public.projects where slug = 'kelas-sore'
$$, 'peran terbuka mengaku admin');

-- can_manage_project, all four answers. Reading seats from inside a seats
-- policy is exactly what would recurse if the helper were SECURITY INVOKER,
-- so these also stand as the recursion check.
select checks.equal(public.can_manage_project((select id from public.projects where slug = 'kelas-sore')), true,  'pemilik boleh mengelola');
select checks.act_as('22222222-2222-4222-8222-222222222222');
select checks.equal(public.can_manage_project((select id from public.projects where slug = 'kelas-sore')), true,  'admin boleh mengelola');
select checks.act_as('33333333-3333-4333-8333-333333333333');
select checks.equal(public.can_manage_project((select id from public.projects where slug = 'kelas-sore')), false, 'anggota tidak mengelola');
select checks.act_as_guest();
select checks.equal(public.can_manage_project((select id from public.projects where slug = 'kelas-sore')), false, 'tamu tidak mengelola');

-- Admins run the work, not the project.
select checks.act_as('22222222-2222-4222-8222-222222222222');
update public.projects set title = 'Dirombak Admin' where slug = 'kelas-sore';
select checks.equal((select title from public.projects where slug = 'kelas-sore'),
                    'Kelas Sore', 'admin tidak bisa mengubah brief');

-- A WITH CHECK failure raises, unlike a USING clause, which filters silently.
-- That is why this one is checks.denied and the brief edit above is not.
select checks.denied($$update public.seats set access = 'admin' where user_id = '33333333-3333-4333-8333-333333333333'$$,
                     'admin mengangkat admin baru');
select checks.equal((select access from public.seats where user_id = '33333333-3333-4333-8333-333333333333'),
                    'member', 'anggota tetap anggota');

select checks.allowed($$
  insert into public.tasks (project_id, title, detail, created_by, assignee_id)
  select id, 'Tugas asli', 'Ngobrol ke lima warung.', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'
  from public.projects where slug = 'kelas-sore'
$$, 'admin membuat tugas');

select checks.denied($$
  insert into public.tasks (project_id, title, created_by, assignee_id)
  select id, 'Tugas titipan', '22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444'
  from public.projects where slug = 'kelas-sore'
$$, 'menugaskan orang di luar proyek');

select checks.act_as('33333333-3333-4333-8333-333333333333');
select checks.denied($$
  insert into public.tasks (project_id, title, created_by)
  select id, 'Tugas bikinan sendiri', '33333333-3333-4333-8333-333333333333'
  from public.projects where slug = 'kelas-sore'
$$, 'anggota membuat tugas');

-- The assignee may move their own task along …
select checks.allowed($$select public.move_task((select id from public.tasks limit 1), 'doing')$$,
                      'yang kebagian memindahkan tugasnya');
select checks.equal((select status from public.tasks limit 1), 'doing', 'tugas jadi dikerjakan');

-- … and nothing else. This is the whole reason move_task exists instead of an
-- UPDATE policy: row level security cannot narrow a write down to one column.
update public.tasks set title = 'Dibajak', assignee_id = '33333333-3333-4333-8333-333333333333';
select checks.equal((select title from public.tasks limit 1), 'Tugas asli',
                    'yang kebagian tidak bisa menulis ulang tugasnya');

select checks.denied($$select public.move_task((select id from public.tasks limit 1), 'entah')$$,
                     'status tugas yang tidak ada');

delete from public.tasks;
select checks.equal((select count(*)::int from public.tasks), 1, 'anggota tidak bisa menghapus tugas');

-- A bystander is not the assignee and manages nothing.
select checks.act_as('44444444-4444-4444-8444-444444444444');
select checks.denied($$select public.move_task((select id from public.tasks limit 1), 'done')$$,
                     'orang luar memindahkan tugas');

select checks.act_as_guest();
select checks.denied($$select public.move_task((select id from public.tasks limit 1), 'done')$$,
                     'tamu memindahkan tugas');
select checks.denied($$
  insert into public.tasks (project_id, title, created_by)
  select id, 'Tugas tamu', '11111111-1111-4111-8111-111111111111' from public.projects where slug = 'kelas-sore'
$$, 'tamu membuat tugas');

-- Managers may rewrite the task itself.
select checks.act_as('22222222-2222-4222-8222-222222222222');
update public.tasks set title = 'Ngobrol ke lima warung';
select checks.equal((select title from public.tasks limit 1), 'Ngobrol ke lima warung',
                    'admin boleh mengubah tugas');

select checks.equal((select open_task_count::int from public.project_overview where slug = 'kelas-sore'), 1, 'hitungan tugas jalan');
select checks.equal((select done_task_count::int from public.project_overview where slug = 'kelas-sore'), 0, 'hitungan tugas beres');

-- Somebody leaving a project releases their tasks rather than leaving them
-- pointing at a person who is no longer on it.
select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.equal((select assignee_id from public.tasks limit 1), '33333333-3333-4333-8333-333333333333'::uuid, 'tugas ada yang pegang');
select checks.allowed($$delete from public.seats where user_id = '33333333-3333-4333-8333-333333333333'$$, 'pemilik melepas anggota');
select checks.equal((select assignee_id from public.tasks limit 1), null::uuid, 'tugasnya ikut dilepas');

-- ------------------------------------------------------------------ jejak --

-- The trail is written by triggers, so by now the actions above have already
-- produced entries. What matters is who they are attributed to, that nobody can
-- forge one, and that hiding a kind really hides it.

select checks.act_as('11111111-1111-4111-8111-111111111111');

-- The owner accepted dina's application, but joining is dina's to show.
select checks.equal(
  (select e.actor_id from public.events e where e.kind = 'seat_filled' order by e.id desc limit 1),
  '22222222-2222-4222-8222-222222222222'::uuid, 'yang gabung yang punya jejaknya, bukan yang menerima');

select checks.equal(
  (select e.actor_id from public.events e where e.kind = 'project_created' order by e.id limit 1),
  '11111111-1111-4111-8111-111111111111'::uuid, 'yang menaruh ide yang punya jejaknya');

select checks.equal(
  (select (e.payload ->> 'task_title') from public.events e where e.kind = 'task_created' order by e.id desc limit 1),
  'Tugas asli', 'jejak tugas menyimpan judulnya');

-- Nothing anybody can write by hand.
select checks.denied($$
  insert into public.events (actor_id, kind, payload)
  values ('11111111-1111-4111-8111-111111111111', 'task_done', '{"task_title":"Karangan"}'::jsonb)
$$, 'mengarang jejak sendiri');
select checks.denied($$update public.events set kind = 'task_done'$$, 'mengubah jejak');
select checks.denied($$delete from public.events$$, 'menghapus jejak');

-- A statement with nobody behind it writes nothing. This is what keeps
-- supabase/seed.sql from manufacturing history for backdated projects.
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.projects (slug, title, tagline, owner_id, problem, solution, audience, tags)
values ('uji-tanpa-orang', 'Uji Tanpa Orang', 'Disisipkan tanpa ada orang di baliknya.',
        '11111111-1111-4111-8111-111111111111', repeat('m', 130), repeat('s', 130), repeat('u', 45), array['uji']);
select checks.equal((select count(*)::int from public.events where payload ->> 'slug' = 'uji-tanpa-orang'),
                    0, 'tanpa orang di baliknya, tidak ada jejak');
delete from public.projects where slug = 'uji-tanpa-orang';

-- Hiding a kind has to be a database rule, or the anon key reads straight past it.
select checks.act_as('22222222-2222-4222-8222-222222222222');
select checks.allowed($$
  update public.profiles set activity_hidden = array['comment_posted'] where id = '22222222-2222-4222-8222-222222222222'
$$, 'menyembunyikan satu jenis jejak');

select checks.denied($$
  update public.profiles set activity_hidden = array['bukan-jenis-apa-apa'] where id = '22222222-2222-4222-8222-222222222222'
$$, 'menyembunyikan jenis yang tidak ada');

select checks.equal(
  (select count(*)::int from public.events where actor_id = '22222222-2222-4222-8222-222222222222' and kind = 'comment_posted'),
  1, 'pemiliknya tetap melihat jejaknya sendiri');

select checks.act_as_guest();
select checks.equal(
  (select count(*)::int from public.events where actor_id = '22222222-2222-4222-8222-222222222222' and kind = 'comment_posted'),
  0, 'orang lain tidak melihat jejak yang disembunyikan');
select checks.equal(
  (select count(*)::int from public.events where actor_id = '22222222-2222-4222-8222-222222222222' and kind = 'seat_filled'),
  1, 'jenis lain tetap kelihatan');

-- Somebody else's choice is not yours to make.
select checks.act_as('33333333-3333-4333-8333-333333333333');
update public.profiles set activity_hidden = array['task_done'] where id = '22222222-2222-4222-8222-222222222222';
select checks.equal((select activity_hidden from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
                    array['comment_posted'], 'pilihan orang lain tidak bisa diubah');

-- ------------------------------------------------------------- keputusan --

-- Who may answer an application, and what declining leaves behind.
--
-- 0004 widened decide_seat from the owner to can_manage_project() and made
-- declining reset `access` too. 0008 rewrote the function to add the notice,
-- built it on the 0002 body, and lost both without a word — while the project
-- page kept offering admins the buttons. 0009 put them back; this is what
-- keeps them there.

select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.allowed($$
  insert into public.seats (project_id, role, brief)
  select id, 'content-writer', 'Menulis pengumuman mingguan.'
  from public.projects where slug = 'kelas-sore'
$$, 'pemilik membuka peran penulis');

select checks.act_as('44444444-4444-4444-8444-444444444444');
select checks.allowed($$
  select public.submit_proposal(null, (select id from public.seats where role = 'content-writer'), 'Bisa nulis tiap Jumat.')
$$, 'orang luar mengajukan role penulis');

-- An admin flag on a seat nobody holds would hand over the keys the moment an
-- application is accepted. Two things stop it, and this checks both: the
-- constraint refuses to store it at all, and declining resets `access` anyway
-- so the reopened seat is a plain member even if that constraint ever loosens.
select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.denied($$update public.seats set access = 'admin' where role = 'content-writer'$$,
                     'menandai admin di peran yang belum terisi');

select checks.allowed($$select public.decide_proposal((select id from public.proposals where seat_id = (select id from public.seats where role = 'content-writer') and status = 'pending'), false)$$,
                      'pemilik menolak proposal');
select checks.equal((select status from public.seats where role = 'content-writer'), 'open', 'peran tetap terbuka');
select checks.equal((select access from public.seats where role = 'content-writer'), 'member',
                    'peran yang dibuka lagi tetap anggota');
select checks.equal((select user_id from public.seats where role = 'content-writer'), null::uuid,
                    'pelamarnya dilepas dari peran');

-- Dina is an admin on this project, and the project page offers her these
-- buttons. The database has to agree.
select checks.act_as('44444444-4444-4444-8444-444444444444');
select checks.allowed($$
  select public.submit_proposal(null, (select id from public.seats where role = 'content-writer'), 'Sekali lagi, masih bisa.')
$$, 'mengajukan lagi setelah ditolak');

select checks.act_as('22222222-2222-4222-8222-222222222222');
select checks.allowed($$select public.decide_proposal((select id from public.proposals where seat_id = (select id from public.seats where role = 'content-writer') and status = 'pending'), true)$$,
                      'admin menjawab proposal');
select checks.equal((select status from public.seats where role = 'content-writer'), 'filled',
                    'peran terisi lewat keputusan admin');

-- Both answers reached the applicant, and nobody else can read them.
select checks.act_as('44444444-4444-4444-8444-444444444444');
select checks.equal((select count(*)::int from public.notices), 2, 'pelamar dikabari dua keputusan');
select checks.act_as('33333333-3333-4333-8333-333333333333');
-- This one applied for the design role and was settled when somebody else was
-- accepted onto it — 0016 declines every remaining proposal rather than leaving
-- anybody waiting — so they have exactly one notice, their own.
select checks.equal((select count(*)::int from public.notices), 1,
                    'yang ikut melamar dikabari saat orang lain diterima');
select checks.equal((select count(*)::int from public.notices
                     where recipient_id = '44444444-4444-4444-8444-444444444444'), 0,
                    'kabar orang lain tidak terbaca');

-- ----------------------------------------------------- kabar & mengikuti --

-- The journey a project writes for itself: who may add to it, who may not,
-- and the fact that it can never be quietly reworded after people read it.

select checks.act_as('33333333-3333-4333-8333-333333333333');
select checks.denied($$
  insert into public.updates (project_id, author_id, title, body)
  select id, '33333333-3333-4333-8333-333333333333', 'Kabar dari anggota', 'Bukan urusan saya.'
  from public.projects where slug = 'kelas-sore'
$$, 'anggota menulis kabar project');

-- Dina is an admin here, and admins run the work.
select checks.act_as('22222222-2222-4222-8222-222222222222');
select checks.allowed($$
  insert into public.updates (project_id, author_id, title, body)
  select id, '22222222-2222-4222-8222-222222222222', 'Draft pertama selesai', 'Dua puluh topik terkumpul.'
  from public.projects where slug = 'kelas-sore'
$$, 'admin menulis kabar project');

select checks.denied($$
  insert into public.updates (project_id, author_id, title)
  select id, '11111111-1111-4111-8111-111111111111', 'Atas nama orang lain'
  from public.projects where slug = 'kelas-sore'
$$, 'menulis kabar atas nama orang lain');

-- No UPDATE policy and no update grant: a log entry can be removed, never
-- reworded. Rewriting one after people have read it is a different lie from
-- deleting it, and only one of the two is honest.
-- Refused at the grant, before any policy is consulted, so it raises rather
-- than quietly matching nothing.
select checks.denied($$update public.updates set title = 'Diam-diam diganti'$$,
                     'menulis ulang kabar yang sudah dibaca orang');
select checks.equal((select title from public.updates limit 1), 'Draft pertama selesai',
                    'kabar tetap seperti saat ditulis');

select checks.equal((select count(*)::int from public.events where kind = 'update_posted'), 1,
                    'menulis kabar meninggalkan jejak');

-- A USING clause filters instead of raising, so this is checked by what
-- survives rather than by checks.denied.
select checks.act_as('44444444-4444-4444-8444-444444444444');
delete from public.updates;
select checks.equal((select count(*)::int from public.updates), 1, 'orang luar tidak menghapus kabar');

-- Following is a private intention with a public count: anybody may see who
-- follows what, but only you can start or stop following as you.
select checks.allowed($$
  insert into public.follows (project_id, user_id)
  select id, '44444444-4444-4444-8444-444444444444' from public.projects where slug = 'kelas-sore'
$$, 'mengikuti project');

select checks.denied($$
  insert into public.follows (project_id, user_id)
  select id, '33333333-3333-4333-8333-333333333333' from public.projects where slug = 'kelas-sore'
$$, 'mengikuti atas nama orang lain');

select checks.act_as('33333333-3333-4333-8333-333333333333');
delete from public.follows;
select checks.equal((select count(*)::int from public.follows), 1,
                    'orang lain tidak bisa membatalkan ikutan siapa-siapa');

select checks.act_as('44444444-4444-4444-8444-444444444444');
select checks.allowed($$delete from public.follows where user_id = '44444444-4444-4444-8444-444444444444'$$,
                      'berhenti mengikuti sendiri');

-- The "sekarang" line is the freshness people read, so its timestamp is the
-- trigger's to write and nobody else's.
select checks.act_as('11111111-1111-4111-8111-111111111111');
update public.projects set now_text = 'Menyusun jadwal minggu depan.', now_updated_at = '2001-01-01'
where slug = 'kelas-sore';
select checks.equal(
  (select now_updated_at > '2020-01-01'::timestamptz from public.projects where slug = 'kelas-sore'),
  true, 'tanggal "sekarang" ditulis trigger, bukan pengirimnya');

-- An admin may write that one line and nothing else on the project row, which
-- is exactly why set_now() is a function and not a policy.
select checks.act_as('22222222-2222-4222-8222-222222222222');
update public.projects set now_text = 'Lewat pintu belakang.' where slug = 'kelas-sore';
select checks.equal((select now_text from public.projects where slug = 'kelas-sore'),
                    'Menyusun jadwal minggu depan.', 'admin tidak menulis langsung ke barisnya');

select checks.allowed($$
  select public.set_now((select id from public.projects where slug = 'kelas-sore'), 'Menguji ke lima orang tua.')
$$, 'admin menulis kalimat sekarang');
select checks.equal((select now_text from public.projects where slug = 'kelas-sore'),
                    'Menguji ke lima orang tua.', 'kalimatnya berubah');
select checks.equal((select title from public.projects where slug = 'kelas-sore'),
                    'Kelas Sore', 'brief-nya tidak ikut tersentuh');

select checks.act_as('33333333-3333-4333-8333-333333333333');
select checks.denied($$
  select public.set_now((select id from public.projects where slug = 'kelas-sore'), 'Anggota menulis.')
$$, 'anggota menulis kalimat sekarang');

-- Clearing the line can cost the project the level it stood on. It has to drop
-- honestly rather than be refused by the CHECK constraint.
select checks.act_as('11111111-1111-4111-8111-111111111111');
update public.projects set stage = 'building' where slug = 'kelas-sore';
select checks.allowed($$
  select public.set_now((select id from public.projects where slug = 'kelas-sore'), '')
$$, 'mengosongkan kalimat sekarang');
select checks.equal((select stage from public.projects where slug = 'kelas-sore'), 'idea',
                    'tanpa sandaran lain, tahapnya turun sendiri');

-- ----------------------------------------------------------------- masukan --

-- The feedback box is closed: the form opens GitHub issues now, and the
-- function that wrote here is gone. Nobody may read the old rows back or
-- write new ones.
select checks.act_as('22222222-2222-4222-8222-222222222222');

select checks.denied($$select public.submit_feedback('idea', 'Tolong tambahkan filter berdasarkan bahasa.', 'dina@example.com')$$,
                     'anggota mengirim masukan lewat fungsi lama');
select checks.denied($$select count(*) from public.feedback$$,
                     'anggota membaca kotak masukan');
select checks.denied($$insert into public.feedback (kind, message) values ('bug', 'Lewat jalan belakang.')$$,
                     'anggota menulis langsung ke tabelnya');

reset role;

-- ------------------------------------------------------------ tutup peran --

-- Closing a role turns off new proposals and nothing else. Deleting the seat
-- would have been the easy way to do it, but `proposals.seat_id` cascades, so
-- it would take down whoever was still waiting on an answer along with the
-- role they applied for.

select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.allowed($$
  insert into public.seats (project_id, role, brief)
  select id, 'growth-marketing', 'Menulis rilis untuk peluncuran.'
  from public.projects where slug = 'tautan-saja'
$$, 'pemilik membuka peran di proyek keduanya');

select checks.act_as('44444444-4444-4444-8444-444444444444');
select checks.allowed($$
  select public.submit_proposal(null, (select id from public.seats where role = 'growth-marketing'),
                                'Saya bisa bantu menulis rilisnya.')
$$, 'mengajukan selagi peran masih terbuka');

-- Closing is a manager's move, and the UPDATE policy is what says so.
select checks.act_as('33333333-3333-4333-8333-333333333333');
update public.seats set status = 'closed' where role = 'growth-marketing';
select checks.equal((select status from public.seats where role = 'growth-marketing'), 'open',
                    'orang luar tidak bisa menutup peran orang');

select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.allowed($$update public.seats set status = 'closed' where role = 'growth-marketing'$$,
                      'pemilik menutup peran');

-- Closed to new proposals: submit_proposal only ever looks for an open seat.
select checks.act_as('33333333-3333-4333-8333-333333333333');
select checks.denied($$
  select public.submit_proposal(null, (select id from public.seats where role = 'growth-marketing'),
                                'Telat, tapi mau coba.')
$$, 'mengajukan setelah peran ditutup');

-- Closed to nothing else: the proposal sent while it was open is still there,
-- still pending, and still gets a real answer.
select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.equal((select count(*)::int from public.proposals
                     where seat_id = (select id from public.seats where role = 'growth-marketing')
                       and status = 'pending'), 1,
                    'lamaran yang sudah masuk tetap menunggu keputusan');
select checks.allowed($$select public.decide_proposal(
  (select id from public.proposals
   where seat_id = (select id from public.seats where role = 'growth-marketing')
     and status = 'pending'), true)$$,
  'menerima lamaran di peran yang sudah ditutup');
select checks.equal((select status from public.seats where role = 'growth-marketing'), 'filled',
                    'peran yang ditutup tetap bisa terisi');
select checks.equal((select user_id from public.seats where role = 'growth-marketing'),
                    '44444444-4444-4444-8444-444444444444'::uuid,
                    'yang diterima jadi pemegang perannya');

-- ------------------------------------------------------------------ delete --

-- Deleting a project has to take its seats, comments and support with it,
-- because app/actions.ts deleteProject() leans on the cascade rather than
-- clearing the children itself.
-- Three by now: two on 'kelas-sore', and the one just filled on 'tautan-saja'.
select checks.equal((select count(*)::int from public.seats), 3, 'ada peran sebelum dihapus');
select checks.equal((select count(*)::int from public.comments), 1, 'ada komentar sebelum dihapus');

select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.allowed($$delete from public.projects where slug = 'kelas-sore'$$, 'pemilik menghapus proyeknya');
-- Only its own: the seat on the other project is untouched, which is the
-- half of "cascade" that is easy to get wrong in the other direction.
select checks.equal((select count(*)::int from public.seats), 1, 'peran ikut terhapus, tapi cuma milik proyek itu');
select checks.equal((select count(*)::int from public.comments), 0, 'komentar ikut terhapus');
select checks.equal((select count(*)::int from public.updates), 0, 'kabar ikut terhapus');
select checks.equal((select count(*)::int from public.follows), 0, 'ikutan ikut terhapus');
select checks.equal((select count(*)::int from public.boosts), 0, 'dukungan ikut terhapus');
select checks.equal((select count(*)::int from public.tasks), 0, 'tugas ikut terhapus');

-- Deliberately the other way round for the trail: events release the project
-- rather than cascading, and the payload keeps the title, so somebody's history
-- does not develop a hole when a project they worked on is deleted.
select checks.equal(
  (select (e.payload ->> 'title') from public.events e where e.kind = 'project_created' order by e.id limit 1),
  'Kelas Sore', 'jejak menyimpan judul proyek yang sudah dihapus');
select checks.equal(
  (select e.project_id from public.events e where e.kind = 'project_created' order by e.id limit 1),
  null::bigint, 'jejak melepas proyeknya, bukan ikut terhapus');

-- Put it back so the guest checks below still have something to read.
select checks.allowed($$
  insert into public.projects (slug, title, tagline, owner_id, problem, solution, audience, tags)
  values ('kelas-sore', 'Kelas Sore', 'Papan jadwal kelas tambahan gratis di kampung.',
          '11111111-1111-4111-8111-111111111111',
          repeat('m', 130), repeat('s', 130), repeat('u', 45), array['pendidikan'])
$$, 'pemilik menaruh ulang proyeknya');

-- -------------------------------------------------------------------- anon --

select checks.act_as_guest();
select checks.equal(auth.uid(), null::uuid, 'tamu benar-benar tanpa identitas');

-- Two by now: 'kelas-sore', and the link-only project opened right at the top.
select checks.equal((select count(*)::int from public.projects), 2, 'tamu tetap bisa membaca papan');
select checks.equal((select count(*)::int from public.project_overview), 2, 'tamu bisa membaca ringkasan');

select checks.denied($$
  insert into public.projects (slug, title, tagline, owner_id, problem, solution, audience, tags)
  values ('tamu', 'Tamu', 'Tamu mencoba menaruh ide tanpa masuk.',
          '11111111-1111-4111-8111-111111111111',
          repeat('m', 130), repeat('s', 130), repeat('u', 45), array['uji'])
$$, 'tamu menaruh ide');

select checks.denied($$select public.submit_proposal(null, (select id from public.seats limit 1), 'Tamu mengajukan bantuan.')$$,
                     'tamu mengajukan role');

-- A guest reports through GitHub now; the old function no longer exists.
select checks.denied($$select public.submit_feedback('bug', 'Masuk dengan Google berhenti di halaman kosong.')$$,
                     'tamu mengirim masukan lewat fungsi lama');
select checks.denied($$select count(*) from public.feedback$$, 'tamu membaca kotak masukan');
select checks.denied($$insert into public.feedback (kind, message) values ('bug', 'Lewat jalan belakang.')$$,
                     'tamu menulis langsung ke tabelnya');

-- The overview must agree with the rows it counts.
-- The project was just re-created, so every count starts from nothing again.
select checks.equal((select seat_count::int from public.project_overview where slug = 'kelas-sore'), 0, 'hitungan peran');
select checks.equal((select comment_count::int from public.project_overview where slug = 'kelas-sore'), 0, 'hitungan komentar');
select checks.equal((select boost_count::int from public.project_overview where slug = 'kelas-sore'), 0, 'hitungan dukungan');
select checks.equal((select open_task_count::int from public.project_overview where slug = 'kelas-sore'), 0, 'hitungan tugas jalan');
select checks.equal((select done_task_count::int from public.project_overview where slug = 'kelas-sore'), 0, 'hitungan tugas beres');

-- ------------------------------------------------------- oss_contributions --
-- A member's open source record feeds the directory's badges, so it must be
-- readable by anybody and writable only by its owner.

select checks.act_as('22222222-2222-4222-8222-222222222222');

select checks.allowed($$
  insert into public.oss_contributions (user_id, repo, relation)
  values ('22222222-2222-4222-8222-222222222222', 'vercel/next.js', 'contributor')
$$, 'anggota mencatat repo yang pernah dikontribusi');

select checks.denied($$
  insert into public.oss_contributions (user_id, repo, relation)
  values ('22222222-2222-4222-8222-222222222222', 'vercel/next.js', 'maintainer')
$$, 'repo yang sama dicatat dua kali');

select checks.denied($$
  insert into public.oss_contributions (user_id, repo)
  values ('11111111-1111-4111-8111-111111111111', 'supabase/supabase')
$$, 'mencatat kontribusi atas nama orang lain');

select checks.denied($$
  insert into public.oss_contributions (user_id, repo)
  values ('22222222-2222-4222-8222-222222222222', 'Vercel/Next.js')
$$, 'repo harus huruf kecil');

select checks.denied($$
  insert into public.oss_contributions (user_id, repo)
  values ('22222222-2222-4222-8222-222222222222', 'https://github.com/a/b')
$$, 'repo harus owner/nama, bukan URL');

select checks.denied($$
  insert into public.oss_contributions (user_id, repo, relation)
  values ('22222222-2222-4222-8222-222222222222', 'a/b', 'founder')
$$, 'peran di luar contributor/maintainer');

select checks.denied($$
  update public.oss_contributions set relation = 'maintainer'
  where user_id = '22222222-2222-4222-8222-222222222222'
$$, 'mengubah baris yang sudah ada');

select checks.act_as('11111111-1111-4111-8111-111111111111');

delete from public.oss_contributions where user_id = '22222222-2222-4222-8222-222222222222';
select checks.equal((select count(*)::int from public.oss_contributions), 1,
                    'menghapus catatan orang lain tidak berpengaruh');

select checks.act_as_guest();
select checks.equal((select count(*)::int from public.oss_contributions), 1, 'tamu bisa membaca catatan open source');
select checks.denied($$
  insert into public.oss_contributions (user_id, repo)
  values ('22222222-2222-4222-8222-222222222222', 'tamu/repo')
$$, 'tamu mencatat kontribusi');

select checks.act_as('22222222-2222-4222-8222-222222222222');
delete from public.oss_contributions where user_id = '22222222-2222-4222-8222-222222222222';
select checks.equal((select count(*)::int from public.oss_contributions), 0, 'anggota menghapus catatannya sendiri');

-- -------------------------------------------------- oss_repos / site_admins --
-- Members submit repos as pending under their own name; only a site admin
-- approves, edits, or removes. Guests see approved rows alone.

select checks.act_as('22222222-2222-4222-8222-222222222222');

select checks.equal(public.is_site_admin(), false, 'anggota biasa bukan admin');

select checks.allowed($$
  insert into public.oss_repos (repo, why, submitted_by)
  values ('acme/tool', 'Maintainer-nya responsif.', '22222222-2222-4222-8222-222222222222')
$$, 'anggota mengusulkan repo');

select checks.denied($$
  insert into public.oss_repos (repo, why, submitted_by, status)
  values ('acme/self-approved', 'Langsung tampil tanpa review.', '22222222-2222-4222-8222-222222222222', 'approved')
$$, 'anggota menyetujui usulannya sendiri saat mengirim');

select checks.denied($$
  insert into public.oss_repos (repo, why, submitted_by)
  values ('acme/other', 'Atas nama orang lain.', '11111111-1111-4111-8111-111111111111')
$$, 'mengusulkan atas nama orang lain');

select checks.denied($$
  insert into public.oss_repos (repo, why, submitted_by)
  values ('acme/short', 'bagus', '22222222-2222-4222-8222-222222222222')
$$, 'alasan terlalu pendek');

select checks.denied($$
  insert into public.oss_repos (repo, why, submitted_by, reasons)
  values ('acme/odd', 'Alasan yang cukup panjang.', '22222222-2222-4222-8222-222222222222', array['ours'])
$$, 'tanda di luar daftar');

-- RLS hides the row from an UPDATE rather than raising, so check the result.
update public.oss_repos set status = 'approved' where repo = 'acme/tool';
select checks.equal((select status from public.oss_repos where repo = 'acme/tool'), 'pending',
                    'anggota tidak bisa menyetujui usulannya sendiri');

select checks.act_as('33333333-3333-4333-8333-333333333333');
select checks.equal((select count(*)::int from public.oss_repos where repo = 'acme/tool'), 0,
                    'usulan pending tidak terlihat oleh anggota lain');
select checks.equal((select count(*)::int from public.site_admins), 0, 'daftar admin tidak terbaca anggota lain');

select checks.act_as_guest();
select checks.equal((select count(*)::int from public.oss_repos), 1, 'tamu hanya melihat repo yang disetujui');

-- An admin is made by hand, exactly as the migration's comment describes.
reset role;
insert into public.site_admins (user_id) values ('11111111-1111-4111-8111-111111111111');

select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.equal(public.is_site_admin(), true, 'admin dikenali');
select checks.equal((select count(*)::int from public.oss_repos), 2, 'admin melihat antrean');

select checks.allowed($$
  update public.oss_repos
  set status = 'approved', reviewed_by = '11111111-1111-4111-8111-111111111111', reviewed_at = now()
  where repo = 'acme/tool'
$$, 'admin menyetujui usulan');

select checks.allowed($$
  insert into public.oss_repos (repo, why, status, submitted_by)
  values ('acme/direct', 'Ditambahkan langsung oleh admin.', 'approved', '11111111-1111-4111-8111-111111111111')
$$, 'admin menambah repo langsung');

select checks.act_as_guest();
select checks.equal((select count(*)::int from public.oss_repos), 3, 'repo yang disetujui muncul untuk tamu');

select checks.act_as('22222222-2222-4222-8222-222222222222');
delete from public.oss_repos where repo = 'acme/tool';
select checks.equal((select count(*)::int from public.oss_repos where repo = 'acme/tool'), 1,
                    'pengusul tidak bisa menghapus repo yang sudah disetujui');

select checks.allowed($$
  insert into public.oss_repos (repo, why, submitted_by)
  values ('acme/withdrawn', 'Nanti ditarik kembali.', '22222222-2222-4222-8222-222222222222')
$$, 'anggota mengusulkan lagi');
delete from public.oss_repos where repo = 'acme/withdrawn';
select checks.equal((select count(*)::int from public.oss_repos where repo = 'acme/withdrawn'), 0,
                    'pengusul menarik usulan yang masih pending');

select checks.act_as('11111111-1111-4111-8111-111111111111');
delete from public.oss_repos where repo = 'acme/direct';
select checks.equal((select count(*)::int from public.oss_repos where repo = 'acme/direct'), 0, 'admin menghapus repo');

-- -------------------------------------------------- reactions on the feed --
-- 20261101000000: a reaction may sit on a product's day (event:<id>) when the
-- feed can show that day, and only then. The three key kinds share one
-- column, so each rule is pinned to the database here.

reset role;

-- Dina already hid her comment_posted above; hiding her update too gives a
-- feed-kind event (update_posted) that only she can see.
update public.profiles set activity_hidden = array['comment_posted', 'update_posted']
where id = '22222222-2222-4222-8222-222222222222';

-- A reaction on her hidden update, seeded the way history would leave it: the
-- row exists, but only the visible half of it is readable.
insert into public.activity_reactions (pull_request_url, user_id, emoji)
values ('event:' || (select e.id::text from public.events e
                     where e.kind = 'update_posted' order by e.id limit 1),
        '11111111-1111-4111-8111-111111111111', 'tada');

-- The id of the hidden feed event, captured while the trail is still
-- readable: under RLS the reactor cannot resolve it, and the two checks
-- below must not lean on that accident.
create temp table checks_hidden_feed_event (url text not null);
insert into checks_hidden_feed_event
select 'event:' || e.id::text from public.events e
where e.kind = 'update_posted' order by e.id limit 1;
grant select on checks_hidden_feed_event to anon, authenticated;

select checks.act_as('22222222-2222-4222-8222-222222222222');

select checks.allowed($$
  insert into public.activity_reactions (pull_request_url, user_id, emoji)
  values ('event:' || (select e.id::text from public.events e
                       where e.kind = 'project_created'
                         and e.actor_id = '11111111-1111-4111-8111-111111111111'
                       order by e.id limit 1),
          '22222222-2222-4222-8222-222222222222', 'heart')
$$, 'bereaksi pada hari produk di feed');

select checks.denied($$
  insert into public.activity_reactions (pull_request_url, user_id, emoji)
  values ('event:' || (select e.id::text from public.events e
                       where e.kind = 'project_created'
                         and e.actor_id = '11111111-1111-4111-8111-111111111111'
                       order by e.id limit 1),
          '11111111-1111-4111-8111-111111111111', 'rocket')
$$, 'bereaksi atas nama orang lain');

select checks.denied($$
  insert into public.activity_reactions (pull_request_url, user_id, emoji)
  values ('event:999999999', '22222222-2222-4222-8222-222222222222', 'tada')
$$, 'bereaksi pada hari yang tidak ada');

-- The feed kinds are project_created, project_stage_changed, update_posted,
-- seat_opened, seat_filled; task_created is not one of them.
select checks.act_as('33333333-3333-4333-8333-333333333333');

select checks.denied($$
  insert into public.activity_reactions (pull_request_url, user_id, emoji)
  values ('event:' || (select e.id::text from public.events e
                       where e.kind = 'task_created' order by e.id limit 1),
          '33333333-3333-4333-8333-333333333333', 'fire')
$$, 'bereaksi pada jenis yang tidak ditampilkan feed');

-- An event its actor hid is out of sight for everybody else, so a reaction on
-- it is refused — and the seeded row above is not readable either.
select checks.denied($$
  insert into public.activity_reactions (pull_request_url, user_id, emoji)
  select url, '33333333-3333-4333-8333-333333333333', 'clap' from checks_hidden_feed_event
$$, 'bereaksi pada jejak yang disembunyikan pemiliknya');

select checks.act_as_guest();
select checks.equal(
  (select count(*)::int from public.activity_reactions
   where pull_request_url = 'event:' || (select e.id::text from public.events e
       where e.kind = 'project_created'
         and e.actor_id = '11111111-1111-4111-8111-111111111111'
       order by e.id limit 1)),
  1, 'reaksi pada hari yang terlihat ikut terbaca tamu');
select checks.equal(
  (select count(*)::int from public.activity_reactions a
   where a.pull_request_url = (select url from checks_hidden_feed_event)),
  0, 'reaksi pada jejak tersembunyi tidak terbaca');
select checks.denied($$
  insert into public.activity_reactions (pull_request_url, user_id, emoji)
  values ('event:1', '44444444-4444-4444-8444-444444444444', 'tada')
$$, 'tamu bereaksi');

-- The notice goes to whoever did the thing reacted to, once, and says whose
-- product news it was.
select checks.act_as('11111111-1111-4111-8111-111111111111');
select checks.equal(
  (select (n.payload ->> 'target') || ':' || (n.payload ->> 'title')
   from public.notices n
   where n.kind = 'pull_request_reacted'
     and n.payload ->> 'url' = 'event:' || (select e.id::text from public.events e
         where e.kind = 'project_created'
           and e.actor_id = '11111111-1111-4111-8111-111111111111'
         order by e.id limit 1)),
  'event:Kelas Sore', 'pemilik produk dikabari reaksinya');
select checks.equal(
  (select count(*)::int from public.notices n
   where n.kind = 'pull_request_reacted'
     and n.recipient_id = '11111111-1111-4111-8111-111111111111'
     and n.payload ->> 'actor_id' = '22222222-2222-4222-8222-222222222222'),
  1, 'satu kabar per orang per hari');

reset role;
select checks.equal((select count(*)::int from public.feedback), 0, 'tidak ada masukan yang masuk ke tabel');
select checks.equal((select count(*)::int from pg_proc where proname = 'submit_feedback' and pronamespace = 'public'::regnamespace), 0,
                    'fungsi submit_feedback sudah dihapus');

rollback;

drop schema checks cascade;
