-- Supabase SQL Editor에서 프로젝트 선택 후 전체 실행 (여러 번 실행해도 안전)
create extension if not exists "pgcrypto";

-- 태그: 사용자별, 이름 정규화 유니크, 색상 인덱스
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color_index smallint not null default 0 check (color_index >= 0 and color_index < 16),
  created_at timestamptz not null default now(),
  name_normalized text generated always as (lower(trim(name))) stored,
  constraint tags_name_not_empty check (length(trim(name)) > 0)
);

create unique index if not exists tags_user_name_norm on public.tags (user_id, name_normalized);
create index if not exists tags_user_created on public.tags (user_id, created_at desc);

-- 메모 본문·출처
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null default '',
  source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 예전에 만든 notes에 source 컬럼이 없을 때
alter table public.notes
  add column if not exists source text not null default '';

create index if not exists notes_user_created on public.notes (user_id, created_at desc);

-- 메모–태그 다대다
create table if not exists public.note_tags (
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (note_id, tag_id)
);

create index if not exists note_tags_by_tag on public.note_tags (tag_id);

create or replace function public.set_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_updated_at on public.notes;
create trigger notes_updated_at
  before update on public.notes
  for each row
  execute function public.set_notes_updated_at();

alter table public.tags enable row level security;
alter table public.notes enable row level security;
alter table public.note_tags enable row level security;

drop policy if exists tags_select on public.tags;
drop policy if exists tags_insert on public.tags;
drop policy if exists tags_update on public.tags;
drop policy if exists tags_delete on public.tags;

create policy tags_select on public.tags
  for select using (auth.uid() = user_id);
create policy tags_insert on public.tags
  for insert with check (auth.uid() = user_id);
create policy tags_update on public.tags
  for update using (auth.uid() = user_id);
create policy tags_delete on public.tags
  for delete using (auth.uid() = user_id);

drop policy if exists notes_select on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;

create policy notes_select on public.notes
  for select using (auth.uid() = user_id);
create policy notes_insert on public.notes
  for insert with check (auth.uid() = user_id);
create policy notes_update on public.notes
  for update using (auth.uid() = user_id);
create policy notes_delete on public.notes
  for delete using (auth.uid() = user_id);

drop policy if exists note_tags_select on public.note_tags;
drop policy if exists note_tags_insert on public.note_tags;
drop policy if exists note_tags_delete on public.note_tags;

create policy note_tags_select on public.note_tags
  for select using (
    exists (
      select 1 from public.notes n
      where n.id = note_tags.note_id and n.user_id = auth.uid()
    )
  );

create policy note_tags_insert on public.note_tags
  for insert with check (
    exists (
      select 1 from public.notes n
      where n.id = note_tags.note_id and n.user_id = auth.uid()
    )
    and exists (
      select 1 from public.tags t
      where t.id = note_tags.tag_id and t.user_id = auth.uid()
    )
  );

create policy note_tags_delete on public.note_tags
  for delete using (
    exists (
      select 1 from public.notes n
      where n.id = note_tags.note_id and n.user_id = auth.uid()
    )
  );
