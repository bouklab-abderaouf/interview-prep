alter table profiles    enable row level security;
alter table documents   enable row level security;
alter table roadmaps    enable row level security;
alter table stages      enable row level security;
alter table sessions    enable row level security;
alter table turns       enable row level security;
alter table scorecards  enable row level security;
alter table progress    enable row level security;
alter table usage_counters enable row level security;   -- no policies: service role only

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own documents" on documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own roadmaps" on roadmaps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "stages of own roadmaps" on stages
  for select using (exists (
    select 1 from roadmaps r where r.id = stages.roadmap_id and r.user_id = auth.uid()
  ));

create policy "own sessions" on sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "turns of own sessions" on turns
  for all using (exists (
    select 1 from sessions s where s.id = turns.session_id and s.user_id = auth.uid()
  ));

create policy "scorecards of own sessions" on scorecards
  for select using (exists (
    select 1 from sessions s where s.id = scorecards.session_id and s.user_id = auth.uid()
  ));

create policy "own progress" on progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
