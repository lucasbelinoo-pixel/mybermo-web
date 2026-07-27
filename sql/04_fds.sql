-- myBermo — folhas de dados (FDs) por usuário (Supabase)
-- Cada usuário só lê/grava as próprias FDs (RLS por auth.uid()). "data" é o
-- registro do fdlog local (ver index.html, logFD()/fdSync()); "html" é o
-- snapshot impresso da FD (mesmo conteúdo hoje guardado em
-- localStorage['mybermo_fdhtml'], limitado a 400 000 caracteres no upload —
-- snapshots maiores ficam só locais, html:null).
-- id = mesmo id gerado pelo cliente em logFD() (Date.now()+'-'+random,
-- text) — não é gerado pelo Supabase; por isso a chave primária é composta
-- (user_id, id): o mesmo texto de id pode, em teoria, colidir entre dois
-- usuários diferentes (não há coordenação entre navegadores/contas), mas
-- nunca deveria colidir para o MESMO usuário.

create table if not exists public.fds (
  id            text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  html          text,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists fds_user_id_idx on public.fds(user_id);

alter table public.fds enable row level security;

drop policy if exists "usuario le proprias fds" on public.fds;
create policy "usuario le proprias fds" on public.fds
  for select using ( auth.uid() = user_id );

drop policy if exists "usuario insere proprias fds" on public.fds;
create policy "usuario insere proprias fds" on public.fds
  for insert with check ( auth.uid() = user_id );

drop policy if exists "usuario atualiza proprias fds" on public.fds;
create policy "usuario atualiza proprias fds" on public.fds
  for update using ( auth.uid() = user_id ) with check ( auth.uid() = user_id );

drop policy if exists "usuario apaga proprias fds" on public.fds;
create policy "usuario apaga proprias fds" on public.fds
  for delete using ( auth.uid() = user_id );
