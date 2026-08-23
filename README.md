# Controle Financeiro

App para controlar gastos, receitas e investimentos, com login por email e
lançamento de transações também pelo Telegram. Site 100% estático
(HTML/CSS/JS puro, sem build, sem framework) — o backend (login, banco de
dados, bot do Telegram) é o **Supabase**, que tem plano gratuito permanente
e sem cartão de crédito.

## Como funciona

- Você faz login/cadastro com email e senha (Supabase Auth).
- Cada usuário só enxerga os próprios dados (protegido por Row Level
  Security no banco).
- Ao criar a conta, já vêm 8 categorias padrão (Alimentação, Transporte,
  Moradia, Saúde, Lazer, Outros, Salário, Outras receitas) — dá pra criar
  quantas categorias personalizadas quiser depois, com emoji e cor.
- Transações podem ser parceladas (gera uma transação por mês futuro) e
  contas fixas podem ser lançadas automaticamente todo mês (Recorrências).
- Um bot do Telegram permite lançar despesas/receitas de qualquer lugar,
  respondendo as perguntas do bot (categoria, valor, parcelamento,
  descrição).
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

> **Cache do navegador:** os arquivos CSS/JS são carregados com uma
> versão na URL (`?v=8`). Se você editar esses arquivos no futuro, aumente
> esse número em [`index.html`](index.html) e [`app.html`](app.html) —
> assim o navegador de quem já visitou o site busca a versão nova em vez
> de usar a antiga que guardou em cache.

## Passo 4 — Ligar o bot do Telegram (opcional)

Com isso, você lança despesas e receitas direto pelo Telegram, respondendo
as perguntas do bot.

### 4.1. Criar o bot

1. No Telegram, procure por **@BotFather** e inicie uma conversa.
2. Envie `/newbot`, escolha um nome e um usuário (precisa terminar em
   `bot`, ex: `meucontrolefinanceiro_bot`).
3. O BotFather te dá um **token** (algo como `123456:ABC-DEF...`). Guarde.

### 4.2. Instalar o Supabase CLI e logar

Com [Node.js](https://nodejs.org) instalado:

```bash
npm install -g supabase
supabase login
```

Isso abre o navegador pra você autorizar o CLI na sua conta Supabase.

### 4.3. Ligar a pasta do projeto ao seu projeto Supabase

Na pasta deste projeto:

```bash
supabase link --project-ref SEU_PROJECT_REF
```

O `SEU_PROJECT_REF` é o trecho antes de `.supabase.co` na Project URL
(Passo 1.6).

### 4.4. Configurar os "secrets" da função

Esses valores ficam só no servidor, nunca no site:

- **`SUPABASE_SERVICE_ROLE_KEY`**: Project Settings → API → `service_role`
  (a chave secreta, diferente da `anon public`).
- **`TELEGRAM_BOT_TOKEN`**: o token do Passo 4.1.
- **`TELEGRAM_WEBHOOK_SECRET`**: uma senha aleatória inventada por você
  (ex: gere uma em https://1password.com/password-generator/), só serve
  pra confirmar que as chamadas realmente vêm do Telegram.

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
supabase secrets set TELEGRAM_WEBHOOK_SECRET=uma-senha-bem-aleatoria-aqui
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

### 4.5. Publicar a função

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

O `--no-verify-jwt` é necessário porque quem chama essa função é o
Telegram, não um usuário logado no app — a proteção contra chamadas
falsas vem do `TELEGRAM_WEBHOOK_SECRET`, conferido dentro da função.

Ao final, o comando mostra a URL da função, algo como:
`https://SEU_PROJECT_REF.supabase.co/functions/v1/telegram-webhook`

### 4.6. Avisar o Telegram pra onde mandar as mensagens

Troque `SEU_PROJECT_REF`, `SEU_BOT_TOKEN` e `SUA_SENHA_ALEATORIA` pelos
seus valores e rode (pode ser no terminal ou colando a URL no navegador):

```bash
curl "https://api.telegram.org/botSEU_BOT_TOKEN/setWebhook?url=https://SEU_PROJECT_REF.supabase.co/functions/v1/telegram-webhook&secret_token=SUA_SENHA_ALEATORIA"
```

Deve responder `{"ok":true,"result":true,...}`.

### 4.7. Usar

1. No app, abra a aba **Telegram** → **Gerar código**.
2. No Telegram, abra o chat com seu bot e envie o código gerado.
3. Envie `/novo` pro bot pra lançar uma despesa ou receita — ele pergunta
   tipo, categoria (com botões, ou "➕ Nova categoria"), valor, se é
   parcelado e descrição, mostra um resumo e confirma antes de salvar.

> Pelo bot a data do lançamento é sempre "hoje" (não dá pra escolher outra
> data por lá, só pelo site).

## Estrutura do projeto

```
index.html                             Tela de login/cadastro
app.html                                App principal (todas as abas)
css/style.css                           Visual do site
js/config.js                            Chaves do Supabase (você preenche)
js/supabaseClient.js                    Inicialização do cliente Supabase
js/login.js                             Lógica da tela de login/cadastro
js/app.js                               Estado compartilhado, navegação, guard de login
js/categories.js                        CRUD de categorias + seletor de emoji
js/transactions.js                      CRUD de transações, edição e parcelamento
js/recurring.js                         Recorrências (contas fixas automáticas)
js/investments.js                       CRUD de investimentos
js/dashboard.js                         Visão geral: totais do mês e últimas transações
js/charts.js                            Aba Gráficos (mensal, anual, por categoria)
js/telegram.js                          Vínculo da conta com o bot do Telegram
supabase-schema.sql                     Script para criar as tabelas no Supabase
supabase/functions/telegram-webhook/    Edge Function que conversa com o bot
```

## Possíveis melhorias futuras

- Metas de gastos por categoria e alertas.
- Exportar relatório do mês em PDF/CSV.
- Gráfico de evolução patrimonial dos investimentos ao longo do tempo
  (hoje só mostra o valor atual, não o histórico).
- Lançar transações direto por texto livre no Telegram (ex: "Mercado
  85,90"), sem precisar do fluxo de perguntas.
- Editar recorrências e investimentos já cadastrados (hoje dá pra
  adicionar, pausar/retomar e excluir, mas não editar os valores).
