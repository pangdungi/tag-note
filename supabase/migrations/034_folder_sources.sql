-- 폴더(상위 태그)에 출처를 연결하면 그 출처의 메모를 폴더 목록에 함께 표시한다.

create table if not exists public.folder_sources (
  user_id uuid not null references auth.users (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tag_id, source_id)
);

create index if not exists folder_sources_user_tag
  on public.folder_sources (user_id, tag_id);
create index if not exists folder_sources_source
  on public.folder_sources (source_id);

alter table public.folder_sources enable row level security;

drop policy if exists folder_sources_select on public.folder_sources;
drop policy if exists folder_sources_insert on public.folder_sources;
drop policy if exists folder_sources_delete on public.folder_sources;

create policy folder_sources_select on public.folder_sources
  for select using (auth.uid() = user_id);

create policy folder_sources_insert on public.folder_sources
  for insert with check (auth.uid() = user_id);

create policy folder_sources_delete on public.folder_sources
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.folder_sources to authenticated;

create or replace function public.parent_tree_memo_counts()
returns table (tag_id uuid, memo_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with tree as (
    select t.id as parent_id, t.id as member_id
    from public.tags t
    where t.user_id = auth.uid()
      and coalesce(t.is_parent, false)
    union
    select t.parent_id, t.id
    from public.tags t
    where t.user_id = auth.uid()
      and t.parent_id is not null
    union
    select l.parent_tag_id, l.tag_id
    from public.tag_parent_links l
    join public.tags t on t.id = l.tag_id
    where t.user_id = auth.uid()
  ),
  by_tag as (
    select tree.parent_id, nt.note_id
    from tree
    join public.note_tags nt on nt.tag_id = tree.member_id
    where nt.user_id = auth.uid()
  ),
  by_source as (
    select fs.tag_id as parent_id, n.id as note_id
    from public.folder_sources fs
    join public.notes n on n.source_id = fs.source_id
    where fs.user_id = auth.uid()
      and n.user_id = auth.uid()
  )
  select parent_id, count(distinct note_id)::bigint
  from (
    select parent_id, note_id from by_tag
    union
    select parent_id, note_id from by_source
  ) u
  group by parent_id
$$;

notify pgrst, 'reload schema';
