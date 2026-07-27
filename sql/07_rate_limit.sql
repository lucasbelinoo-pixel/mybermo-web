-- =============================================================
-- myBermo — rate limit por usuário (anti-macro no /api/calc)
-- Tabela sem policies (RLS ligada) => só service_role acessa.
-- rate_hit: limpa janelas antigas do usuário, incrementa o bucket
-- do minuto e retorna a contagem. Chamada pelo servidor a cada
-- cálculo (lib/rate.js). Limites no código: 90/min + 1500/h.
-- =============================================================
create table if not exists public.rate_limit (
  user_id  uuid not null,
  janela   timestamptz not null,
  contagem int not null default 0,
  primary key (user_id, janela)
);
alter table public.rate_limit enable row level security;

create or replace function public.rate_hit(p_user uuid, p_janela timestamptz)
returns int
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit
   where user_id = p_user and janela < now() - interval '2 hours';
  insert into public.rate_limit(user_id, janela, contagem)
       values (p_user, p_janela, 1)
  on conflict (user_id, janela)
    do update set contagem = rate_limit.contagem + 1
  returning contagem;
$$;

revoke execute on function public.rate_hit(uuid, timestamptz) from anon, authenticated;
