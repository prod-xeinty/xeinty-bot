alter table public.loop_producers
  add column telegram_chat text check (telegram_chat ~ '^https://t[.]me/[a-z0-9_]{4,32}$');

create unique index loop_producers_owner_chat_idx
  on public.loop_producers (telegram_user_id, telegram_chat) where telegram_chat is not null;

alter table public.beats
  add column loop_author_id uuid references public.loop_producers(id) on delete set null;

create index beats_loop_author_idx on public.beats (loop_author_id) where loop_author_id is not null;

notify pgrst, 'reload schema';
