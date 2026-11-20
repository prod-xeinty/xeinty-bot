alter table public.telegram_channels
  add column if not exists connected_at timestamptz not null default now();

create index if not exists telegram_channels_chat_idx on public.telegram_channels (chat_id);

create table if not exists public.telegram_audio_updates (
  chat_id bigint not null,
  message_id integer not null check (message_id > 0),
  published_at timestamptz not null,
  audio_name text,
  primary key (chat_id, message_id)
);

alter table public.telegram_audio_updates enable row level security;
revoke all on public.telegram_audio_updates from public, anon, authenticated;
grant select, insert on public.telegram_audio_updates to service_role;

create or replace function public.record_telegram_audio_update(
  p_chat_id bigint, p_message_id integer, p_published_at timestamptz, p_audio_name text
)
returns void language sql set search_path = '' as $function$
  insert into public.telegram_audio_updates (chat_id, message_id, published_at, audio_name)
  select p_chat_id, p_message_id, p_published_at, p_audio_name
  where exists (select 1 from public.telegram_channels c where c.chat_id = p_chat_id)
  on conflict (chat_id, message_id) do nothing;
$function$;

revoke all on function public.record_telegram_audio_update(bigint, integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_telegram_audio_update(bigint, integer, timestamptz, text) to service_role;

create or replace function public.pending_telegram_audio(p_owner bigint)
returns table (channel text, first_id integer, last_id integer, count integer)
language sql stable set search_path = '' as $function$
  select c.chat_id::text, min(u.message_id), max(u.message_id), count(*)::integer
  from public.telegram_channels c
  join public.telegram_audio_updates u on u.chat_id = c.chat_id
  where c.telegram_user_id = p_owner
    and u.published_at >= date_trunc('second', c.connected_at)
    and not exists (
      select 1 from public.beats b
      where b.telegram_user_id = p_owner and b.telegram_source_chat_id = u.chat_id and b.telegram_source_message_id = u.message_id
    )
    and not exists (
      select 1 from public.beat_publications p
      join public.beats b on b.id = p.beat_id
      where b.telegram_user_id = p_owner and p.platform = 'telegram'
        and lower(btrim(b.audio_name)) = lower(btrim(u.audio_name))
        and lower(p.url) in (
          'https://t.me/c/' || (-1000000000000 - c.chat_id)::text || '/' || u.message_id::text,
          'https://t.me/' || lower(c.username) || '/' || u.message_id::text,
          'https://t.me/s/' || lower(c.username) || '/' || u.message_id::text
        )
    )
  group by c.chat_id
  order by max(u.published_at) desc, c.chat_id;
$function$;

revoke all on function public.pending_telegram_audio(bigint) from public, anon, authenticated;
grant execute on function public.pending_telegram_audio(bigint) to service_role;

notify pgrst, 'reload schema';
