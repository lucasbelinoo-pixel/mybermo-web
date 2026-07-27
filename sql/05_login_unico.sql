-- myBermo — login único (multi_login)
-- Política de sessão: por padrão, logar numa máquina NOVA derruba as
-- sessões anteriores do mesmo usuário (ver index.html,
-- mbLoadProfileAndEnter() -> MB.sb.auth.signOut({scope:'others'})).
-- Exceções: admins (sempre, checado no cliente via profiles.is_admin) e
-- usuários com multi_login=true aqui (checkbox "Login simultâneo" na tela
-- 👤 Usuários — ver api/users.js, action 'update').
--
-- Este ALTER foi rodado manualmente pelo usuário (fora deste repositório de
-- migrações incrementais, ver 01_setup.sql..04_fds.sql); este arquivo só
-- documenta o schema para consistência com os demais — reaplicar é seguro
-- (idempotente via "if not exists").
alter table public.profiles
  add column if not exists multi_login boolean not null default false;

-- Sem RLS/policy nova: profiles já tem select/update restritos a
-- auth.uid()=id ou admin (ver 01_setup.sql) — multi_login é só mais uma
-- coluna dentro dessas mesmas regras. A ESCRITA de multi_login por outro
-- usuário (admin editando o perfil de terceiros) passa pelo endpoint
-- server-side /api/users.js (service_role, ignora RLS, checa is_admin do
-- chamador antes de tudo) — não depende de uma policy de update ampliada
-- aqui.
