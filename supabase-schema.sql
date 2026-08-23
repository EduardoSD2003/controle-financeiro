-- Controle Financeiro — schema do Supabase
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e clique em Run.

-- Perfis de usuário (dados extras além do que o auth.users já guarda)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- Categorias de gastos e receitas
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('despesa', 'receita')),
  color text not null default '#6366f1',
  icon text not null default '💰',
  description text,
  created_at timestamptz not null default now()
);

-- Recorrências (contas fixas lançadas automaticamente todo mês)
create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('despesa', 'receita')),
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  day_of_month int not null check (day_of_month between 1 and 31),
  start_date date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Transações (gastos e receitas do dia a dia)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  type text not null check (type in ('despesa', 'receita')),
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  date date not null default current_date,
  installment_group_id uuid,
  installment_number int,
  installment_total int,
  recurring_transaction_id uuid references recurring_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Investimentos
create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  amount_invested numeric(12, 2) not null default 0,
  current_value numeric(12, 2) not null default 0,
  date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

-- Integração com Telegram: vínculo da conta e estado da conversa do bot.
-- Só a Edge Function (chave service_role) escreve nessas tabelas — o app
-- só gera o código e confere se já está vinculado.
create table if not exists telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists telegram_links (
  telegram_user_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade unique,
  telegram_username text,
  created_at timestamptz not null default now()
);

create table if not exists telegram_conversations (
  telegram_user_id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  step text not null,
  draft jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Segurança: cada usuário só acessa os próprios dados
alter table profiles enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table investments enable row level security;
alter table recurring_transactions enable row level security;
alter table telegram_link_codes enable row level security;
alter table telegram_links enable row level security;
alter table telegram_conversations enable row level security;

create policy "própria conta" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "próprias categorias" on categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "próprias transações" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "próprios investimentos" on investments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "próprias recorrências" on recurring_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- O app só precisa gerar (insert) e ler (select) seus próprios códigos;
-- quem consome e apaga o código é a Edge Function, com a chave service_role.
create policy "gerar próprio código" on telegram_link_codes
  for insert with check (auth.uid() = user_id);

create policy "ver próprios códigos" on telegram_link_codes
  for select using (auth.uid() = user_id);

-- O app só lê e desvincula (delete) sua própria conta; quem cria o vínculo
-- é a Edge Function (service_role), nunca o próprio usuário.
create policy "ver próprio vínculo" on telegram_links
  for select using (auth.uid() = user_id);

create policy "desvincular própria conta" on telegram_links
  for delete using (auth.uid() = user_id);

-- telegram_conversations não tem nenhuma policy: só a service_role
-- (Edge Function) consegue ler/escrever nela.

-- Quando um usuário se cadastra, cria o perfil e algumas categorias padrão
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Alimentação', 'despesa', '#f97316', '🍽️'),
    (new.id, 'Transporte', 'despesa', '#3b82f6', '🚗'),
    (new.id, 'Moradia', 'despesa', '#8b5cf6', '🏠'),
    (new.id, 'Saúde', 'despesa', '#ef4444', '💊'),
    (new.id, 'Lazer', 'despesa', '#ec4899', '🎮'),
    (new.id, 'Outros', 'despesa', '#6b7280', '📦'),
    (new.id, 'Salário', 'receita', '#22c55e', '💼'),
    (new.id, 'Outras receitas', 'receita', '#14b8a6', '➕');

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
