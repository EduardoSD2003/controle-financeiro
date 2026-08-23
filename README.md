# Controle Financeiro

App simples para controlar gastos, receitas e investimentos, com login por
email. Site 100% estático (HTML/CSS/JS puro, sem build, sem framework) —
o backend (login, banco de dados) é o **Supabase**, que tem plano gratuito
permanente e sem cartão de crédito.

> A integração com WhatsApp (lançar gastos mandando mensagem) fica para uma
> fase 2 — a base de dados já está pronta para receber isso depois.

## Como funciona

- Você faz login/cadastro com email e senha (Supabase Auth).
- Cada usuário só enxerga os próprios dados (protegido por Row Level
  Security no banco).
- Ao criar a conta, já vêm 8 categorias padrão (Alimentação, Transporte,
  Moradia, Saúde, Lazer, Outros, Salário, Outras receitas) — dá pra criar
  quantas categorias personalizadas quiser depois.
- Tudo é salvo em tempo real no Supabase (Postgres).

## Passo 1 — Criar o backend gratuito (Supabase)

1. Acesse **https://supabase.com** e crie uma conta grátis (dá pra usar
   login do GitHub).
2. Clique em **New Project**. Escolha um nome, uma senha para o banco
   (guarde, mas você não vai precisar dela no dia a dia) e a região mais
   próxima de você. Plano **Free**.
3. Espere o projeto terminar de ser criado (cerca de 1-2 minutos).
4. No menu lateral, abra **SQL Editor** → **New query**, cole todo o
   conteúdo do arquivo [`supabase-schema.sql`](supabase-schema.sql) deste
   projeto e clique em **Run**.
5. Vá em **Authentication** → **Providers** → confirme que **Email** está
   habilitado. Se quiser testar rápido sem precisar confirmar email a cada
   cadastro, vá em **Authentication** → **Settings** e desative
   "Confirm email" (não recomendado para produção).
6. Vá em **Project Settings** (ícone de engrenagem) → **API**. Copie:
   - **Project URL**
   - **anon public** key (a chave pública, não a `service_role`)
7. Abra o arquivo [`js/config.js`](js/config.js) neste projeto e cole os
   dois valores:
   ```js
   const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

> A chave `anon public` é feita para ser usada no navegador — não é
> secreta como uma senha. A proteção dos dados vem do login (Row Level
> Security), não da chave.

## Passo 2 — Testar localmente

Com [Node.js](https://nodejs.org) instalado, na pasta do projeto rode:

```bash
npx serve .
```

E abra o endereço que aparecer no terminal (algo como
`http://localhost:3000`). Crie uma conta, faça login e comece a lançar
transações.

## Passo 3 — Publicar de graça (GitHub Pages)

1. Crie uma conta grátis em **https://github.com** se ainda não tiver.
2. Crie um repositório novo.
3. Envie os arquivos deste projeto para o repositório:
   ```bash
   git init
   git add .
   git commit -m "Controle financeiro"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
   git push -u origin main
   ```
4. No GitHub, abra o repositório → **Settings** → **Pages**.
5. Em **Build and deployment** → **Source**, escolha **Deploy from a
   branch**. Em **Branch**, escolha `main` e pasta `/ (root)`. Salve.
6. Em 1-2 minutos o GitHub mostrará o link do site, algo como:
   `https://SEU_USUARIO.github.io/SEU_REPOSITORIO/`

## Estrutura do projeto

```
index.html            Tela de login/cadastro
app.html               App principal (Visão Geral, Transações, Investimentos, Categorias)
css/style.css           Visual do site
js/config.js            Chaves do Supabase (você preenche)
js/supabaseClient.js    Inicialização do cliente Supabase
js/login.js             Lógica da tela de login/cadastro
js/app.js               Estado compartilhado, navegação entre abas, guard de login
js/categories.js        CRUD de categorias
js/transactions.js      CRUD de transações (gastos e receitas)
js/investments.js       CRUD de investimentos
js/dashboard.js         Visão geral: totais do mês e gráfico por categoria
supabase-schema.sql     Script para criar as tabelas no Supabase
```

## Possíveis melhorias futuras

- Integração com WhatsApp: enviar uma mensagem tipo "Mercado 85,90" e o
  gasto entrar automaticamente na categoria certa (via API oficial do
  WhatsApp/Meta — decisão pendente de conta Business).
- Editar transações e investimentos (hoje dá pra adicionar e excluir).
- Metas de gastos por categoria e alertas.
- Exportar relatório do mês em PDF/CSV.
- Gráfico de evolução patrimonial dos investimentos ao longo do tempo.
- Recorrência automática para contas fixas (aluguel, assinaturas).
