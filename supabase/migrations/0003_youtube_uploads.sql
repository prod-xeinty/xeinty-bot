create table public.youtube_connections (
  telegram_user_id bigint primary key,
  refresh_token text not null
);

create table public.youtube_oauth_states (
  telegram_user_id bigint primary key,
  state uuid not null unique,
  expires_at timestamptz not null
);

create table public.youtube_uploads (
  id uuid primary key,
  telegram_user_id bigint not null,
  beat_id uuid not null references public.beats(id) on delete cascade,
  session_url text not null,
  access_token text not null,
  expires_at timestamptz not null,
  file_size bigint not null check (file_size > 0),
  mime_type text not null,
  video_id text
);

alter table public.youtube_connections enable row level security;
alter table public.youtube_oauth_states enable row level security;
alter table public.youtube_uploads enable row level security;
revoke all on public.youtube_connections, public.youtube_oauth_states, public.youtube_uploads from public, anon, authenticated;
grant select, insert, update, delete on public.youtube_connections, public.youtube_oauth_states, public.youtube_uploads to service_role;
