create table if not exists public.tracks (
  user_id text not null,
  track_id text not null,
  filename text,
  file_path text,
  key text,
  scale text,
  key_name text,
  camelot_key text,
  bpm numeric,
  energy_level numeric,
  duration numeric,
  file_size numeric,
  bitrate numeric,
  analysis_date text,
  cue_points jsonb default '[]'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, track_id)
);

alter table public.tracks enable row level security;

create policy if not exists "user-can-read-own"   on public.tracks for select using (auth.uid() = user_id);
create policy if not exists "user-can-upsert-own" on public.tracks for insert with check (auth.uid() = user_id);
create policy if not exists "user-can-update-own" on public.tracks for update using (auth.uid() = user_id);


