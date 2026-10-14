-- Bebé a caminho — esquema inicial (MVP fase 1)
-- Aplicar com `supabase db push` ou colar no SQL Editor do Supabase.

create extension if not exists pgcrypto;

-- ---------- Casal ----------
create table couples (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8)),
  created_at timestamptz not null default now()
);

create table couple_members (
  couple_id uuid not null references couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  primary key (couple_id, user_id),
  unique (user_id)
);

create function is_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from couple_members where couple_id = c and user_id = auth.uid());
$$;

create function create_couple(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into couples default values returning id into cid;
  insert into couple_members (couple_id, user_id, display_name) values (cid, auth.uid(), p_name);
  return cid;
end $$;

create function join_couple(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into cid from couples where invite_code = upper(trim(p_code));
  if cid is null then raise exception 'invalid code'; end if;
  if (select count(*) from couple_members where couple_id = cid) >= 2 then
    raise exception 'couple full';
  end if;
  insert into couple_members (couple_id, user_id, display_name) values (cid, auth.uid(), p_name);
  return cid;
end $$;

alter table couples enable row level security;
alter table couple_members enable row level security;
create policy couples_select on couples for select using (is_member(id));
create policy members_select on couple_members for select using (is_member(couple_id));
create policy members_update_self on couple_members for update using (user_id = auth.uid());

-- ---------- Gravidez ----------
create table pregnancy (
  couple_id uuid primary key references couples(id) on delete cascade,
  due_date date not null,
  lmp date
);

-- ---------- Consultas e exames ----------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  kind text not null check (kind in ('consulta', 'ecografia', 'analises', 'outro')),
  title text not null,
  starts_at timestamptz not null,
  location text,
  post_notes text,
  created_by uuid default auth.uid()
);

create table appointment_questions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  text text not null,
  done boolean not null default false
);

create table files (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  appointment_id uuid references appointments(id) on delete set null,
  path text not null,
  name text not null,
  content_type text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Diário da barriga ----------
create table diary_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  week int not null check (week between 1 and 42),
  photo_path text,
  weight_kg numeric(5, 1),
  mood text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (couple_id, week)
);

-- ---------- Listas ----------
create table list_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  list text not null check (list in ('mala', 'compras', 'tarefas')),
  title text not null,
  assignee uuid references auth.users(id) on delete set null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Nomes ----------
create table baby_names (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  name text not null,
  added_by uuid default auth.uid(),
  unique (couple_id, name)
);

create table name_votes (
  name_id uuid not null references baby_names(id) on delete cascade,
  couple_id uuid not null references couples(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vote text not null check (vote in ('sim', 'talvez', 'nao')),
  primary key (name_id, user_id)
);

-- ---------- Ferramentas ----------
create table kick_sessions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  count int not null default 0,
  created_by uuid default auth.uid()
);

create table contractions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_by uuid default auth.uid()
);

-- ---------- RLS: acesso total aos membros do casal ----------
do $$
declare t text;
begin
  foreach t in array array[
    'pregnancy', 'appointments', 'appointment_questions', 'files',
    'diary_entries', 'list_items', 'baby_names', 'kick_sessions', 'contractions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (is_member(couple_id)) with check (is_member(couple_id))',
      t || '_member', t);
  end loop;
end $$;

-- Votos secretos: cada um só vê e altera os seus próprios votos.
alter table name_votes enable row level security;
create policy votes_select_own on name_votes for select using (user_id = auth.uid());
create policy votes_insert_own on name_votes for insert
  with check (user_id = auth.uid() and is_member(couple_id));
create policy votes_update_own on name_votes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(couple_id));
create policy votes_delete_own on name_votes for delete using (user_id = auth.uid());

-- Só revela nomes em que todos os membros votaram "sim".
create function name_matches(p_couple uuid) returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select n.id, n.name
  from baby_names n
  where n.couple_id = p_couple
    and is_member(p_couple)
    and (select count(*) from name_votes v where v.name_id = n.id and v.vote = 'sim')
        = (select count(*) from couple_members m where m.couple_id = p_couple)
    and (select count(*) from couple_members m where m.couple_id = p_couple) = 2
  order by n.name;
$$;

-- ---------- Storage privado ----------
insert into storage.buckets (id, name, public) values ('private', 'private', false)
on conflict (id) do nothing;

-- Ficheiros guardados em <couple_id>/...
create policy private_select on storage.objects for select
  using (bucket_id = 'private' and is_member(((storage.foldername(name))[1])::uuid));
create policy private_insert on storage.objects for insert
  with check (bucket_id = 'private' and is_member(((storage.foldername(name))[1])::uuid));
create policy private_update on storage.objects for update
  using (bucket_id = 'private' and is_member(((storage.foldername(name))[1])::uuid));
create policy private_delete on storage.objects for delete
  using (bucket_id = 'private' and is_member(((storage.foldername(name))[1])::uuid));
