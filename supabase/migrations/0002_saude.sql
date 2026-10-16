-- Bebé a caminho — sintomas diários e tensão arterial no diário.

-- Tensão arterial (mmHg) no registo semanal, ao lado do peso.
alter table diary_entries
  add column bp_systolic int check (bp_systolic between 50 and 260),
  add column bp_diastolic int check (bp_diastolic between 30 and 200);

-- Um registo por sintoma e por dia; intensidade 1 (ligeiro) a 3 (forte).
create table symptom_logs (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references couples(id) on delete cascade,
  day date not null,
  symptom text not null,
  intensity int not null default 1 check (intensity between 1 and 3),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (couple_id, day, symptom)
);
create index symptom_logs_couple_day on symptom_logs (couple_id, day desc);

alter table symptom_logs enable row level security;
create policy symptom_logs_member on symptom_logs for all
  using (is_member(couple_id)) with check (is_member(couple_id));
