-- Metas do dia: água, exercício e suplementos, com histórico.
-- Aplicar no SQL Editor do Supabase (depois de 0001_init.sql).

-- Metas do casal (uma linha; se não existir, a app usa os valores por omissão).
create table goal_settings (
  couple_id uuid primary key references couples(id) on delete cascade,
  water_ml int not null default 2000 check (water_ml between 250 and 6000),
  glass_ml int not null default 250 check (glass_ml between 50 and 1000),
  exercise_min int not null default 30 check (exercise_min between 5 and 240)
);

-- Suplementos e vitaminas. "starts_on"/"ends_on" evitam reescrever o histórico:
-- um suplemento só conta nos dias em que estava ativo (ends_on é o 1.º dia em que já não conta).
create table supplements (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  dose text check (dose is null or char_length(dose) <= 80),
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now()
);

-- Um registo por dia. Guarda também as metas desse dia, para que mudar a meta
-- hoje não altere os dias passados.
create table day_logs (
  couple_id uuid not null references couples(id) on delete cascade,
  day date not null,
  water_ml int not null default 0 check (water_ml between 0 and 20000),
  exercise_min int not null default 0 check (exercise_min between 0 and 1440),
  water_goal int not null,
  exercise_goal int not null,
  primary key (couple_id, day)
);

-- Suplemento tomado num dia (a existência da linha = tomado).
create table supplement_checks (
  supplement_id uuid not null references supplements(id) on delete cascade,
  couple_id uuid not null references couples(id) on delete cascade,
  day date not null,
  primary key (supplement_id, day)
);

do $$
declare t text;
begin
  foreach t in array array['goal_settings', 'supplements', 'day_logs'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (is_member(couple_id)) with check (is_member(couple_id))',
      t || '_member', t);
  end loop;
end $$;

-- Só se pode marcar um suplemento do próprio casal.
alter table supplement_checks enable row level security;
create policy supplement_checks_member on supplement_checks for all
  using (is_member(couple_id))
  with check (
    is_member(couple_id)
    and exists (select 1 from supplements s where s.id = supplement_id and s.couple_id = supplement_checks.couple_id)
  );

create index day_logs_day on day_logs (couple_id, day desc);
create index supplement_checks_day on supplement_checks (couple_id, day desc);
