alter table public.producer_deals
  add column beat_id uuid references public.beats(id) on delete set null,
  add column sale_type text check (sale_type in ('lease', 'exclusive', 'custom', 'other')),
  add column follow_up_on date,
  add column follow_up_action text check (follow_up_action is null or char_length(follow_up_action) <= 160);

create index producer_deals_beat_idx on public.producer_deals (beat_id) where beat_id is not null;
notify pgrst, 'reload schema';
