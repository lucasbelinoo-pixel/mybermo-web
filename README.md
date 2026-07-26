# myBermo — ferramenta web

Suíte de cálculos de engenharia de utilidades (vapor, válvulas, NH₃, trocador a placas, etc.).

## Arquitetura
- **Frontend:** `index.html` (arquivo único). Hospedado na Vercel (estático) sob o domínio `superdimensional.com.br`.
- **Autenticação/Dados:** Supabase (Auth email+senha, tabela `profiles` com RLS).
- **Cálculos (em migração):** funções de servidor em `api/` — os cálculos proprietários saem do HTML e passam a rodar no servidor, protegidos por login. Migração módulo a módulo; piloto: estação redutora de pressão.

## Segurança
- Login obrigatório (`MB.config.LOGIN_ENABLED = true`).
- As senhas em texto puro foram removidas do HTML; os usuários vivem no Supabase.
- **Repositório deve ser privado.**
- Chave `anon` do Supabase pode ficar no HTML (é pública por design). A `service_role` **nunca** vai no HTML — só em variável de ambiente da Vercel.

## Configuração do Supabase
1. Rodar `sql/01_setup.sql` no SQL Editor (cria tabela `profiles`, RLS e gatilho).
2. Criar o usuário admin em Authentication > Users (Auto Confirm User).
3. Rodar `sql/02_admin.sql` (trocando o e-mail) para marcar o admin.

## Deploy
- Importar o repositório na Vercel → deploy automático a cada push.
- Domínio: adicionar `superdimensional.com.br` em Settings > Domains e cadastrar no registro.br os registros que a Vercel indicar.

## Status da migração para backend
- [x] Login ligado ao Supabase; senhas removidas do HTML
- [ ] Deploy (GitHub + Vercel) — acesso restrito ao admin durante a migração
- [ ] Piloto: estação redutora de pressão no servidor
- [ ] Demais módulos
- [ ] Domínio no ar
- [ ] Tela de cadastro admin (função `api/create-user`)
