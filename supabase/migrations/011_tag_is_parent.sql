-- 상위태그(책) 레일: 하위가 없어도 is_parent=true 이면 북스파인에 표시
alter table public.tags
  add column if not exists is_parent boolean not null default false;

-- 기존: 하위가 있는 태그는 상위태그로 간주
update public.tags p
set is_parent = true
where exists (
  select 1 from public.tags c where c.parent_id = p.id
);

notify pgrst, 'reload schema';
