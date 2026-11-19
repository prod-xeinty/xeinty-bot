create function public.refresh_youtube_schedule(p_owner bigint, p_video_id text, p_expected timestamptz, p_publish_at timestamptz)
returns boolean language plpgsql set search_path = '' as $body$
declare
  current_date_for_video timestamptz;
begin
  select publish_at into current_date_for_video from public.youtube_uploads
    where telegram_user_id = p_owner and video_id = p_video_id and finalized_at is not null
    order by finalized_at desc limit 1 for update;
  if not found or current_date_for_video is distinct from p_expected then return false; end if;
  if current_date_for_video is distinct from p_publish_at then
    perform public.sync_youtube_schedule(p_owner, p_video_id, p_publish_at);
  end if;
  return true;
end;
$body$;

revoke all on function public.refresh_youtube_schedule(bigint, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_youtube_schedule(bigint, text, timestamptz, timestamptz) to service_role;
