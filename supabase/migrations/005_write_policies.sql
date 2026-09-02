-- specs §3's own RLS SQL only ever granted SELECT on these two tables, but
-- the app legitimately needs to INSERT into both via the session-scoped
-- (RLS-respecting) client: stages when /api/analyze builds a roadmap,
-- scorecards when /api/sessions/:id/score finishes grading. Least-privilege:
-- INSERT only, not the full `for all` some other policies use, since
-- nothing in the app updates or deletes either table after creation.

create policy "insert stages for own roadmaps" on stages
  for insert
  with check (exists (
    select 1 from roadmaps r where r.id = stages.roadmap_id and r.user_id = auth.uid()
  ));

create policy "insert scorecards for own sessions" on scorecards
  for insert
  with check (exists (
    select 1 from sessions s where s.id = scorecards.session_id and s.user_id = auth.uid()
  ));
