-- 책등 버킷 비공개 · 레거시 data URL id만 조회 · 검색 커서

update storage.buckets
set public = false
where id = 'source-spines';

drop policy if exists source_spines_select on storage.objects;
create policy source_spines_select on storage.objects
  for select using (
    bucket_id = 'source-spines'
    and auth.uid() is not null
    and split_part(name, '/', 1) = auth.uid()::text
  );

create or replace function public.legacy_spine_source_ids()
returns table (id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id
  from public.sources s
  where s.user_id = auth.uid()
    and s.spine_image_url is not null
    and left(s.spine_image_url, 5) = 'data:';
$$;

drop function if exists public.search_own_note_ids(text, int);

create or replace function public.search_own_note_ids(
  q text,
  lim int default 51,
  before timestamptz default null
)
returns table (id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select n.id
  from public.notes n
  where n.user_id = auth.uid()
    and length(trim(q)) > 0
    and (before is null or n.created_at < before)
    and (
      n.search_tsv @@ plainto_tsquery('simple', trim(q))
      or n.body ilike '%' || replace(replace(trim(q), '%', '\%'), '_', '\_') || '%' escape '\'
      or n.source ilike '%' || replace(replace(trim(q), '%', '\%'), '_', '\_') || '%' escape '\'
    )
  order by n.created_at desc
  limit greatest(1, least(lim, 80));
$$;

grant execute on function public.legacy_spine_source_ids() to authenticated;
grant execute on function public.search_own_note_ids(text, int, timestamptz) to authenticated;

notify pgrst, 'reload schema';
