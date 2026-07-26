-- myBermo — garantir que o usuário admin exista e seja admin
-- Troque o e-mail abaixo pelo e-mail que você cadastrou em Authentication > Users.
-- Robusto: funciona independente da ordem em que você criou o usuário.

insert into public.profiles (id, nome, empresa, is_admin)
select id, 'LUCAS BELINO', 'BERMO', true
from auth.users
where email = 'SEU_EMAIL_AQUI'
on conflict (id) do update
  set is_admin = true,
      nome = excluded.nome;
