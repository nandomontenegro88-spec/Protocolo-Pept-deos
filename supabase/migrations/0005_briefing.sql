-- Bebé a caminho — briefing da consulta.
-- Prioridade das perguntas (1 = tem de perguntar, 2 = quer perguntar, 3 = se houver tempo)
-- e o texto do briefing, que vai na nota do evento do calendário.
-- Pode correr-se mais do que uma vez sem problema.

alter table appointment_questions
  add column if not exists priority int not null default 2 check (priority between 1 and 3);

alter table appointments
  add column if not exists briefing text check (briefing is null or char_length(briefing) <= 4000);
