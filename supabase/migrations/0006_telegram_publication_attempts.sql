create table public.telegram_publication_attempts (
  id uuid primary key,
  telegram_user_id bigint not null,
  channel text not null,
  beat_ids uuid[] not null,
  payload jsonb not null,
  stage text not null check (stage in ('cover_ready','cover_sending','audio_ready','audio_sending','audio_sent','done')),
  url text,
  cover_sent boolean not null default false,
  warnings text[] not null default array[]::text[],
  updated_at timestamptz not null default now()
);

create unique index telegram_publication_one_active_idx on public.telegram_publication_attempts (telegram_user_id)
  where stage <> 'done';

alter table public.telegram_publication_attempts enable row level security;
revoke all on public.telegram_publication_attempts from public, anon, authenticated;
grant select, insert, update on public.telegram_publication_attempts to service_role;

create function public.finish_telegram_publication(p_attempt uuid, p_owner bigint)
returns text language plpgsql set search_path = '' as $body$
declare
  operation public.telegram_publication_attempts%rowtype;
begin
  select * into operation from public.telegram_publication_attempts
    where id = p_attempt and telegram_user_id = p_owner for update;
  if not found or operation.url is null then return 'pending'; end if;
  if operation.stage = 'done' then return 'already_done'; end if;
  if operation.stage <> 'audio_sent' then return 'pending'; end if;
  update public.beats set telegram_link = operation.url, updated_at = now()
    where telegram_user_id = p_owner and id = any(operation.beat_ids);
  if not found then return 'pending'; end if;
  update public.telegram_publication_attempts set stage = 'done', payload = '{}'::jsonb, updated_at = now()
    where id = p_attempt and telegram_user_id = p_owner;
  return 'completed';
end;
$body$;

revoke all on function public.finish_telegram_publication(uuid, bigint) from public, anon, authenticated;
grant execute on function public.finish_telegram_publication(uuid, bigint) to service_role;

alter table public.youtube_uploads add column finalized_at timestamptz;

update public.youtube_uploads as upload set finalized_at = now()
where upload.video_id is not null and exists (
  select 1 from public.beat_publications as history
  where history.beat_id = upload.beat_id and history.platform = 'youtube'
    and history.url = 'https://youtu.be/' || upload.video_id
);

create function public.finish_youtube_publication(p_upload uuid, p_owner bigint)
returns boolean language plpgsql set search_path = '' as $body$
declare
  upload public.youtube_uploads%rowtype;
begin
  select * into upload from public.youtube_uploads
    where id = p_upload and telegram_user_id = p_owner for update;
  if not found or upload.video_id is null then return false; end if;
  if upload.finalized_at is not null then return true; end if;
  update public.beats set youtube_link = 'https://youtu.be/' || upload.video_id,
    youtube_publish_at = upload.publish_at, updated_at = now()
    where telegram_user_id = p_owner and id = upload.beat_id;
  if not found then return false; end if;
  update public.youtube_uploads set finalized_at = now() where id = p_upload and telegram_user_id = p_owner;
  return true;
end;
$body$;

revoke all on function public.finish_youtube_publication(uuid, bigint) from public, anon, authenticated;
grant execute on function public.finish_youtube_publication(uuid, bigint) to service_role;
