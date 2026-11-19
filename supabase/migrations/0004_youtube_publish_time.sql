alter table public.youtube_uploads add column if not exists publish_at timestamptz;
alter table public.beats add column if not exists youtube_publish_at timestamptz;
