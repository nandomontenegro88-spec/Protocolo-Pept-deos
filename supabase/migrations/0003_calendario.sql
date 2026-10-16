-- Bebé a caminho — calendário subscrito (Calendário da Apple, Google, Outlook).
-- Cada casal tem um endereço secreto; quem o tiver vê as consultas, por isso pode ser renovado.

alter table couples
  add column calendar_token text not null unique default encode(gen_random_bytes(18), 'hex');

-- Renova o endereço (o antigo deixa de funcionar). Só para membros do casal.
create function new_calendar_token(p_couple uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if not is_member(p_couple) then raise exception 'not a member'; end if;
  update couples set calendar_token = encode(gen_random_bytes(18), 'hex') where id = p_couple
    returning calendar_token into t;
  return t;
end $$;
revoke execute on function new_calendar_token(uuid) from public, anon;
grant execute on function new_calendar_token(uuid) to authenticated;
