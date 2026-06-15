-- 태그–상위태그 다대다 (한 태그가 여러 상위태그 아래에 둘 수 있음)
create table if not exists public.tag_parent_links (
  user_id uuid not null references auth.users (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  parent_tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tag_id, parent_tag_id),
  constraint tag_parent_links_not_self check (tag_id <> parent_tag_id)
);

create index if not exists tag_parent_links_parent
  on public.tag_parent_links (parent_tag_id);

create index if not exists tag_parent_links_user
  on public.tag_parent_links (user_id);

insert into public.tag_parent_links (user_id, tag_id, parent_tag_id)
select user_id, id, parent_id
from public.tags
where parent_id is not null
on conflict do nothing;

alter table public.tag_parent_links enable row level security;

drop policy if exists tag_parent_links_select on public.tag_parent_links;
drop policy if exists tag_parent_links_insert on public.tag_parent_links;
drop policy if exists tag_parent_links_delete on public.tag_parent_links;

create policy tag_parent_links_select on public.tag_parent_links
  for select using (auth.uid() = user_id);

create policy tag_parent_links_insert on public.tag_parent_links
  for insert with check (auth.uid() = user_id);

create policy tag_parent_links_delete on public.tag_parent_links
  for delete using (auth.uid() = user_id);
