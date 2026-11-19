create table if not exists public.beat_publications (
  beat_id uuid not null references public.beats(id) on delete cascade,
  platform text not null check (platform in ('telegram', 'youtube')),
  url text not null check (url ~* '^https?://' and length(url) <= 1000),
  saved_at timestamptz default now(),
  publish_at timestamptz,
  primary key (beat_id, platform, url)
);

alter table public.beat_publications enable row level security;
revoke all on public.beat_publications from public, anon, authenticated;
grant select, insert, update on public.beat_publications to service_role;

create or replace function public.keep_beat_publication_links()
returns trigger language plpgsql set search_path = '' as $body$
begin
  if btrim(new.telegram_link) ~* '^https?://t[.]me/((s/)?[a-z0-9_]+|c/[0-9]+)/[0-9]+([/?#].*)?$' then
    insert into public.beat_publications (beat_id, platform, url)
    values (new.id, 'telegram', btrim(new.telegram_link))
    on conflict (beat_id, platform, url) do nothing;
  end if;
  if btrim(new.youtube_link) ~* '^https?://((www[.]|m[.]|music[.])?youtube[.]com/(watch[?]|(shorts|live|embed)/)|youtu[.]be/)' then
    insert into public.beat_publications (beat_id, platform, url, publish_at)
    values (new.id, 'youtube', btrim(new.youtube_link), new.youtube_publish_at)
    on conflict (beat_id, platform, url) do update set publish_at = excluded.publish_at
    where public.beat_publications.publish_at is distinct from excluded.publish_at;
  end if;
  return new;
end;
$body$;

revoke all on function public.keep_beat_publication_links() from public, anon, authenticated;
grant execute on function public.keep_beat_publication_links() to service_role;

drop trigger if exists keep_beat_publication_links on public.beats;
create trigger keep_beat_publication_links
after insert or update of telegram_link, youtube_link, youtube_publish_at on public.beats
for each row execute function public.keep_beat_publication_links();

insert into public.beat_publications (beat_id, platform, url, publish_at, saved_at)
select b.id, links.platform, btrim(links.url), links.publish_at, null
from public.beats b
cross join lateral (values
  ('telegram', b.telegram_link, null::timestamptz),
  ('youtube', b.youtube_link, b.youtube_publish_at)
) as links(platform, url, publish_at)
where btrim(links.url) ~* '^https?://' and length(btrim(links.url)) <= 1000
on conflict (beat_id, platform, url) do nothing;

create table if not exists public.platform_daily_views (
  telegram_user_id bigint not null,
  platform text not null check (platform in ('telegram', 'youtube')),
  day date not null,
  views bigint not null check (views >= 0),
  primary key (telegram_user_id, platform, day)
);

alter table public.platform_daily_views enable row level security;
revoke all on public.platform_daily_views from public, anon, authenticated;
grant select, insert, update on public.platform_daily_views to service_role;
