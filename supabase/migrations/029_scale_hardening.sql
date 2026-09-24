-- 1만 명 규모: 스파인 경로 · 집계 RPC · 본문 미리보기 · 검색 인덱스 · 얇은 RLS
create extension if not exists pg_trgm;

-- 1) 스파인 Storage 경로 (목록에는 path만. 기존 data URL 컬럼은 목록 select에서 제외)
alter table public.sources
  add column if not exists spine_image_path text;

comment on column public.sources.spine_image_path is
  'storage source-spines 버킷 객체 경로 (user_id/source_id.jpg)';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-spines',
  'source-spines',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists source_spines_select on storage.objects;
drop policy if exists source_spines_insert on storage.objects;
drop policy if exists source_spines_update on storage.objects;
drop policy if exists source_spines_delete on storage.objects;

create policy source_spines_select on storage.objects
  for select using (bucket_id = 'source-spines');

create policy source_spines_insert on storage.objects
  for insert with check (
    bucket_id = 'source-spines'
    and auth.uid() is not null
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy source_spines_update on storage.objects
  for update using (
    bucket_id = 'source-spines'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy source_spines_delete on storage.objects
  for delete using (
    bucket_id = 'source-spines'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- 2) note_tags.user_id — RLS·집계를 조인 없이
alter table public.note_tags
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

update public.note_tags nt
set user_id = n.user_id
from public.notes n
where n.id = nt.note_id
  and nt.user_id is null;

delete from public.note_tags where user_id is null;

alter table public.note_tags
  alter column user_id set not null;

create index if not exists note_tags_user_tag
  on public.note_tags (user_id, tag_id);
create index if not exists note_tags_user_note
  on public.note_tags (user_id, note_id);

create or replace function public.note_tags_assign_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is null then
    select n.user_id into new.user_id
    from public.notes n
    where n.id = new.note_id;
  end if;
  return new;
end;
$$;

drop trigger if exists note_tags_assign_user_id on public.note_tags;
create trigger note_tags_assign_user_id
  before insert or update of note_id, user_id
  on public.note_tags
  for each row
  execute function public.note_tags_assign_user_id();

-- 3) 목록용 본문 미리보기
alter table public.notes
  add column if not exists body_preview text
  generated always as (left(body, 280)) stored;

-- 4) 검색: trigram + simple fts
alter table public.notes
  add column if not exists search_tsv tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(body, '') || ' ' || coalesce(source, '')
    )
  ) stored;

create index if not exists notes_body_trgm
  on public.notes using gin (body gin_trgm_ops);
create index if not exists notes_source_trgm
  on public.notes using gin (source gin_trgm_ops);
create index if not exists notes_search_tsv
  on public.notes using gin (search_tsv);
create index if not exists notes_user_pinned
  on public.notes (user_id, is_pinned)
  where is_pinned is true;

-- 5) 구독 한 번 보는 헬퍼 + 얇은 RLS
create or replace function public.subscription_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_subscriptions s
    where s.user_id = auth.uid()
      and now() >= s.period_start
      and now() <= s.period_end
  );
$$;

grant execute on function public.subscription_is_active() to authenticated;

create or replace function public.require_own_user(target uuid)
returns boolean
language sql
stable
as $$
  select target = auth.uid() and public.subscription_is_active();
$$;

grant execute on function public.require_own_user(uuid) to authenticated;

drop policy if exists tags_select on public.tags;
drop policy if exists tags_insert on public.tags;
drop policy if exists tags_update on public.tags;
drop policy if exists tags_delete on public.tags;
create policy tags_select on public.tags
  for select using (public.require_own_user(user_id));
create policy tags_insert on public.tags
  for insert with check (public.require_own_user(user_id));
create policy tags_update on public.tags
  for update using (public.require_own_user(user_id));
create policy tags_delete on public.tags
  for delete using (public.require_own_user(user_id));

drop policy if exists notes_select on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;
create policy notes_select on public.notes
  for select using (public.require_own_user(user_id));
create policy notes_insert on public.notes
  for insert with check (public.require_own_user(user_id));
create policy notes_update on public.notes
  for update using (public.require_own_user(user_id));
create policy notes_delete on public.notes
  for delete using (public.require_own_user(user_id));

drop policy if exists note_tags_select on public.note_tags;
drop policy if exists note_tags_insert on public.note_tags;
drop policy if exists note_tags_delete on public.note_tags;
create policy note_tags_select on public.note_tags
  for select using (public.require_own_user(user_id));
create policy note_tags_insert on public.note_tags
  for insert with check (public.require_own_user(user_id));
create policy note_tags_delete on public.note_tags
  for delete using (public.require_own_user(user_id));

drop policy if exists sources_select on public.sources;
drop policy if exists sources_insert on public.sources;
drop policy if exists sources_update on public.sources;
drop policy if exists sources_delete on public.sources;
create policy sources_select on public.sources
  for select using (public.require_own_user(user_id));
create policy sources_insert on public.sources
  for insert with check (public.require_own_user(user_id));
create policy sources_update on public.sources
  for update using (public.require_own_user(user_id));
create policy sources_delete on public.sources
  for delete using (public.require_own_user(user_id));

drop policy if exists bookshelves_select on public.bookshelves;
drop policy if exists bookshelves_insert on public.bookshelves;
drop policy if exists bookshelves_update on public.bookshelves;
drop policy if exists bookshelves_delete on public.bookshelves;
create policy bookshelves_select on public.bookshelves
  for select using (public.require_own_user(user_id));
create policy bookshelves_insert on public.bookshelves
  for insert with check (public.require_own_user(user_id));
create policy bookshelves_update on public.bookshelves
  for update using (public.require_own_user(user_id));
create policy bookshelves_delete on public.bookshelves
  for delete using (public.require_own_user(user_id));

-- 6) 개수 RPC — 전량 다운로드 금지
create or replace function public.tag_memo_counts()
returns table (tag_id uuid, memo_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select nt.tag_id, count(*)::bigint
  from public.note_tags nt
  where nt.user_id = auth.uid()
  group by nt.tag_id
$$;

create or replace function public.source_distinct_tag_counts()
returns table (source_id text, tag_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(n.source_id::text, '__source_view_none__') as source_id,
    count(distinct nt.tag_id)::bigint as tag_count
  from public.notes n
  left join public.note_tags nt on nt.note_id = n.id
  where n.user_id = auth.uid()
    and (
      n.source_id is not null
      or length(trim(coalesce(n.source, ''))) = 0
    )
  group by 1
$$;

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
  )
  select tree.parent_id, count(distinct nt.note_id)::bigint
  from tree
  join public.note_tags nt on nt.tag_id = tree.member_id
  where nt.user_id = auth.uid()
  group by tree.parent_id
$$;

create or replace function public.search_own_note_ids(q text, lim int default 51)
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
    and (
      n.search_tsv @@ plainto_tsquery('simple', trim(q))
      or n.body ilike '%' || replace(replace(trim(q), '%', '\%'), '_', '\_') || '%' escape '\'
      or n.source ilike '%' || replace(replace(trim(q), '%', '\%'), '_', '\_') || '%' escape '\'
    )
  order by n.created_at desc
  limit greatest(1, least(lim, 80))
$$;

grant execute on function public.tag_memo_counts() to authenticated;
grant execute on function public.source_distinct_tag_counts() to authenticated;
grant execute on function public.parent_tree_memo_counts() to authenticated;
grant execute on function public.search_own_note_ids(text, int) to authenticated;

notify pgrst, 'reload schema';
