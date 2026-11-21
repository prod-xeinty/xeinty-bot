create table public.loop_inbox_settings (
  telegram_user_id bigint primary key
);

create table public.loop_inbox_routes (
  sender_id bigint primary key,
  loop_id uuid not null references public.beats(id) on delete cascade,
  expires_at timestamptz not null
);

create table public.loop_inbox (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  sender_id bigint not null,
  message_id integer not null,
  created_at timestamptz not null default now(),
  loop_id uuid references public.beats(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  author_hint text,
  release_url text,
  audio_name text,
  audio_file_id text,
  handled_at timestamptz,
  unique (sender_id, message_id)
);

create index loop_inbox_owner_pending_idx on public.loop_inbox (telegram_user_id, created_at desc, id) where handled_at is null;
alter table public.loop_works add column audio_inbox_id uuid references public.loop_inbox(id);
alter table public.loop_inbox_settings enable row level security;
alter table public.loop_inbox_routes enable row level security;
alter table public.loop_inbox enable row level security;
revoke all on public.loop_inbox_settings, public.loop_inbox_routes, public.loop_inbox from anon, authenticated;
grant select, insert, update, delete on public.loop_inbox_settings, public.loop_inbox_routes, public.loop_inbox to service_role;

create function public.record_loop_inbox(
  p_sender bigint, p_message integer, p_title text, p_author text,
  p_release text, p_audio_name text, p_audio_file_id text
) returns boolean language plpgsql set search_path = '' as $$
declare
  target_loop uuid;
  target_owner bigint;
begin
  perform pg_advisory_xact_lock(p_sender);
  if exists (select 1 from public.loop_inbox where sender_id = p_sender and message_id = p_message) then
    return false;
  end if;

  select b.id, b.telegram_user_id into target_loop, target_owner
  from public.loop_inbox_routes r
  join public.beats b on b.id = r.loop_id and b.is_loop_source
  join public.loop_inbox_settings s on s.telegram_user_id = b.telegram_user_id
  where r.sender_id = p_sender and r.expires_at > now();

  if target_owner is null then
    select telegram_user_id into target_owner from public.loop_inbox_settings where telegram_user_id = p_sender;
  end if;
  if target_owner is null then return false; end if;

  insert into public.loop_inbox (telegram_user_id, sender_id, message_id, loop_id, title, author_hint, release_url, audio_name, audio_file_id)
  values (target_owner, p_sender, p_message, target_loop, p_title, p_author, p_release, p_audio_name, p_audio_file_id);
  delete from public.loop_inbox_routes where sender_id = p_sender;
  return true;
end;
$$;

create function public.save_loop_work_from_inbox(
  p_owner bigint, p_inbox uuid, p_work uuid, p_title text, p_loops uuid[], p_producers uuid[], p_release text
) returns setof public.loop_works language plpgsql set search_path = '' as $$
declare
  incoming public.loop_inbox%rowtype;
  saved public.loop_works%rowtype;
begin
  select * into incoming from public.loop_inbox
  where id = p_inbox and telegram_user_id = p_owner and handled_at is null
  for update;
  if not found then return; end if;

  if p_work is null then
    insert into public.loop_works (telegram_user_id, title, loop_ids, producer_ids, release_url, audio_inbox_id)
    values (p_owner, p_title, p_loops, p_producers, p_release, case when incoming.audio_file_id is not null then incoming.id end)
    returning * into saved;
  else
    update public.loop_works
    set title = p_title, loop_ids = p_loops, producer_ids = p_producers, release_url = p_release,
        audio_inbox_id = case when incoming.audio_file_id is not null then incoming.id else audio_inbox_id end
    where id = p_work and telegram_user_id = p_owner
    returning * into saved;
  end if;
  if saved.id is null then return; end if;

  update public.loop_inbox set handled_at = now() where id = incoming.id;
  return next saved;
end;
$$;

revoke all on function public.record_loop_inbox(bigint, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.save_loop_work_from_inbox(bigint, uuid, uuid, text, uuid[], uuid[], text) from public, anon, authenticated;
grant execute on function public.record_loop_inbox(bigint, integer, text, text, text, text, text) to service_role;
grant execute on function public.save_loop_work_from_inbox(bigint, uuid, uuid, text, uuid[], uuid[], text) to service_role;
notify pgrst, 'reload schema';
