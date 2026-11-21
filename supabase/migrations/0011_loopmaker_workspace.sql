alter table public.beats add column if not exists is_loop_source boolean not null default false;

create index if not exists beats_loop_sources_idx
  on public.beats (telegram_user_id, created_at desc, id) where is_loop_source;

create table public.loop_producers (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  name text not null check (char_length(name) between 1 and 80),
  name_key text generated always as (lower(ltrim(name, '@'))) stored,
  channel text check (channel is null or char_length(channel) <= 150),
  unique (telegram_user_id, name_key)
);

create table public.loop_works (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 120),
  loop_ids uuid[] not null check (cardinality(loop_ids) between 1 and 20),
  producer_ids uuid[] not null check (cardinality(producer_ids) between 1 and 20),
  release_url text check (release_url is null or char_length(release_url) <= 500),
  unique (telegram_user_id, release_url)
);

create index loop_works_owner_created_idx on public.loop_works (telegram_user_id, created_at desc, id);
alter table public.loop_producers enable row level security;
alter table public.loop_works enable row level security;
revoke all on public.loop_producers, public.loop_works from anon, authenticated;
grant select, insert, update, delete on public.loop_producers, public.loop_works to service_role;
notify pgrst, 'reload schema';
