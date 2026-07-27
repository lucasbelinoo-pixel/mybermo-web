-- =============================================================
-- myBermo — espelho das tabelas criadas via chat (documentação)
-- catalogos (VALV/PURG/MATDB/i18n), blocos (compartilhados) e
-- biblioteca (blocos próprios + montagens por usuário).
-- Idempotente: seguro rodar de novo. RLS conforme aplicado em produção.
-- =============================================================

-- ---- catalogos: fonte única dos catálogos editáveis pelo admin ----
create table if not exists public.catalogos (
  nome          text primary key,          -- 'valv' | 'purg' | 'matdb' | 'i18n'
  data          jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.catalogos enable row level security;
drop policy if exists "catalogos leitura autenticada" on public.catalogos;
create policy "catalogos leitura autenticada" on public.catalogos
  for select using ( auth.role() = 'authenticated' );
drop policy if exists "catalogos escrita admin" on public.catalogos;
create policy "catalogos escrita admin" on public.catalogos
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ---- blocos: blocos de desenho compartilhados (admin publica p/ todos) ----
create table if not exists public.blocos (
  id            text primary key,
  cat           text,
  nome          text,
  def           jsonb not null,            -- definição + imagem + portdefs
  atualizado_em timestamptz not null default now()
);
alter table public.blocos enable row level security;
drop policy if exists "blocos leitura autenticada" on public.blocos;
create policy "blocos leitura autenticada" on public.blocos
  for select using ( auth.role() = 'authenticated' );
drop policy if exists "blocos escrita admin" on public.blocos;
create policy "blocos escrita admin" on public.blocos
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ---- biblioteca: blocos próprios e montagens POR USUÁRIO ----
create table if not exists public.biblioteca (
  id            text not null,             -- 'bloco:<id>' | 'montagem:<nome>'
  user_id       uuid not null references auth.users(id) on delete cascade,
  tipo          text not null,             -- 'bloco' | 'montagem'
  data          jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.biblioteca enable row level security;
drop policy if exists "biblioteca do proprio usuario" on public.biblioteca;
create policy "biblioteca do proprio usuario" on public.biblioteca
  for all using ( auth.uid() = user_id ) with check ( auth.uid() = user_id );
