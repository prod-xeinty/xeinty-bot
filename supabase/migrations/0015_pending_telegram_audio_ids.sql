create function public.pending_telegram_audio_posts(p_owner bigint)
returns table (chat_id bigint, message_id integer, published_at timestamptz)
language sql stable set search_path = '' as $function$
  select u.chat_id, u.message_id, u.published_at
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
    );
$function$;

revoke all on function public.pending_telegram_audio_posts(bigint) from public, anon, authenticated;
grant execute on function public.pending_telegram_audio_posts(bigint) to service_role;

create or replace function public.pending_telegram_audio(p_owner bigint)
returns table (channel text, first_id integer, last_id integer, count integer)
language sql stable set search_path = '' as $function$
  select chat_id::text, min(message_id), max(message_id), count(*)::integer
  from public.pending_telegram_audio_posts(p_owner)
  group by chat_id
  order by max(published_at) desc, chat_id;
$function$;

notify pgrst, 'reload schema';
