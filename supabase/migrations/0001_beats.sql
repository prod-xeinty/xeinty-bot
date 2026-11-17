create table if not exists public.beats (
  id uuid primary key,
  telegram_user_id bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 120),
  bpm text not null default '—',
  musical_key text not null default '—',
  tags text not null default '',
  status text not null default 'Черновик',
  audio_name text,
  audio_path text,
  audio_size integer check (audio_size is null or audio_size between 1 and 15728640),
  cover_path text,
  telegram_caption text not null default '',
  youtube_description text not null default '',
  youtube_keywords text not null default '',
  telegram_link text not null default '',
  youtube_link text not null default ''
);

create index if not exists beats_owner_created_idx
  on public.beats (telegram_user_id, created_at desc);

alter table public.beats enable row level security;
revoke all on public.beats from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('beat-previews', 'beat-previews', false, 15728640,
        array['audio/mpeg', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
