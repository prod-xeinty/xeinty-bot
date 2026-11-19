create table if not exists public.telegram_channels (
  telegram_user_id bigint not null,
  chat_id bigint not null,
  title text not null,
  username text,
  primary key (telegram_user_id, chat_id)
);

alter table public.telegram_channels enable row level security;
revoke all on public.telegram_channels from public, anon, authenticated;
grant select, insert, update, delete on public.telegram_channels to service_role;
