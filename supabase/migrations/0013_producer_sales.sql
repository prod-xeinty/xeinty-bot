create table public.producer_deals (
  id uuid primary key,
  telegram_user_id bigint not null,
  title text not null check (char_length(title) between 1 and 120),
  contact text not null default '' check (char_length(contact) <= 80),
  chat_url text check (chat_url is null or char_length(chat_url) <= 500),
  amount_minor integer check (amount_minor is null or amount_minor between 0 and 1000000000),
  currency text not null check (currency in ('RUB','USD','EUR')),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index producer_deals_owner_id_idx on public.producer_deals (telegram_user_id, id);
alter table public.producer_deals enable row level security;
revoke all on public.producer_deals from anon, authenticated;
grant select, insert, update, delete on public.producer_deals to service_role;
notify pgrst, 'reload schema';
