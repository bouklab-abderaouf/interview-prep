insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

create policy "own cv objects" on storage.objects
  for all using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
