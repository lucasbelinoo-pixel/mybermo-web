-- myBermo — configuração inicial do Supabase (rodar UMA vez no SQL Editor)

-- Tabela de perfis (ligada aos usuários do Auth)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null default '',
  empresa    text not null default 'BERMO',
  is_admin   boolean not null default false,
  modules    jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now()
);

-- Função auxiliar para checar admin sem recursão de RLS
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Cria o perfil automaticamente a cada novo usuário do Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, empresa)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome',''),
          coalesce(new.raw_user_meta_data->>'empresa','BERMO'))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Blindagem por linha (RLS)
alter table public.profiles enable row level security;

drop policy if exists "ler proprio ou admin" on public.profiles;
create policy "ler proprio ou admin" on public.profiles
  for select using ( auth.uid() = id or public.is_admin() );

drop policy if exists "admin edita" on public.profiles;
create policy "admin edita" on public.profiles
  for update using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists "admin insere" on public.profiles;
create policy "admin insere" on public.profiles
  for insert with check ( public.is_admin() );

drop policy if exists "admin apaga" on public.profiles;
create policy "admin apaga" on public.profiles
  for delete using ( public.is_admin() );
