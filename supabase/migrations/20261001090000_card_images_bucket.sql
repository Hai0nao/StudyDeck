-- Private bucket for card images. Objects live under "<user id>/<image id>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', false, 2097152,
        array['image/webp', 'image/jpeg', 'image/png', 'image/gif']);

create policy "Card images: read own" on storage.objects for select to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Card images: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Card images: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Card images: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
