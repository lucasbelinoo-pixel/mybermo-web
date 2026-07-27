-- myBermo — projetos por usuário (Supabase)
-- Cada usuário só lê/grava os próprios projetos (RLS por auth.uid()).
-- O conteúdo do projeto (cliente, contato, telefone, num, elaborador, etc.)
-- fica em "data" (jsonb) — o mesmo shape hoje usado pelo MBProj no cliente
-- (ver index.html, IIFE "Biblioteca de Projetos").

create table if not exists public.projetos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  data         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

create index if not exists projetos_user_id_idx on public.projetos(user_id);

alter table public.projetos enable row level security;

drop policy if exists "usuario le proprios projetos" on public.projetos;
create policy "usuario le proprios projetos" on public.projetos
  for select using ( auth.uid() = user_id );

drop policy if exists "usuario insere proprios projetos" on public.projetos;
create policy "usuario insere proprios projetos" on public.projetos
  for insert with check ( auth.uid() = user_id );

drop policy if exists "usuario atualiza proprios projetos" on public.projetos;
create policy "usuario atualiza proprios projetos" on public.projetos
  for update using ( auth.uid() = user_id ) with check ( auth.uid() = user_id );

drop policy if exists "usuario apaga proprios projetos" on public.projetos;
create policy "usuario apaga proprios projetos" on public.projetos
  for delete using ( auth.uid() = user_id );
