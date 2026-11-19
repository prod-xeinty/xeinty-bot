alter table public.youtube_connections add column granted_scopes text;

create function public.sync_youtube_schedule(p_owner bigint, p_video_id text, p_publish_at timestamptz)
returns void language plpgsql set search_path = '' as $body$
declare
  video_url text := 'https://youtu.be/' || p_video_id;
begin
  update public.youtube_uploads set publish_at = p_publish_at
    where telegram_user_id = p_owner and video_id = p_video_id and publish_at is distinct from p_publish_at;
  update public.beats set youtube_publish_at = p_publish_at, updated_at = now()
    where telegram_user_id = p_owner and youtube_link = video_url and youtube_publish_at is distinct from p_publish_at;
  update public.beat_publications as post set publish_at = p_publish_at
    from public.beats as beat where beat.id = post.beat_id and beat.telegram_user_id = p_owner
      and post.platform = 'youtube' and post.url = video_url and post.publish_at is distinct from p_publish_at;
end;
$body$;

revoke all on function public.sync_youtube_schedule(bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_youtube_schedule(bigint, text, timestamptz) to service_role;
