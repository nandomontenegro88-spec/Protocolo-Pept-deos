# Bebé a caminho

App de gravidez a dois (PWA): Vite + React + TypeScript + Supabase.

## Arrancar
1. Criar um projeto Supabase e correr `supabase/migrations/0001_init.sql` e depois `0002_metas_diarias.sql` (SQL Editor ou `supabase db push`).
2. `cp .env.example .env` e preencher URL e anon key.
3. `npm install && npm run dev`

O primeiro utilizador cria o espaço do casal e partilha o código de convite; o segundo entra com esse código (máx. 2 pessoas).

## Notas
- Votos de nomes: RLS só deixa ler os próprios votos; os matches vêm da função `name_matches`.
- Ficheiros e fotos: bucket privado `private`, pastas por casal, acesso por URL assinado.
- `src/data/weeks.ts` é um rascunho das 40 semanas para rever (tamanhos aproximados).
- Fases 2 e 3 (plano de parto, burocracia PT, orçamento, modo bebé) ainda não implementadas.
