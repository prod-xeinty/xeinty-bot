alter table public.beats
  add column if not exists telegram_source_chat_id bigint,
  add column if not exists telegram_source_message_id integer,
  add column if not exists telegram_source_url text,
  add column if not exists telegram_source_date timestamptz;

create unique index if not exists beats_owner_telegram_source_idx
  on public.beats (telegram_user_id, telegram_source_chat_id, telegram_source_message_id);

create index if not exists beats_owner_created_id_idx
  on public.beats (telegram_user_id, created_at desc, id desc);

notify pgrst, 'reload schema';
