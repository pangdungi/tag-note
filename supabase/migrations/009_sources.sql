-- 출처(책·기사 등) — 태그처럼 id로 관리, 메모당 1개
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  title_normalized text generated always as (
    lower(regexp_replace(trim(title), '\s+', ' ', 'g'))
  ) stored,
  constraint sources_title_not_empty check (length(trim(title)) > 0)
);

create unique index if not exists sources_user_title_norm
  on public.sources (user_id, title_normalized);
create index if not exists sources_user_created
  on public.sources (user_id, created_at desc);

alter table public.notes
  add column if not exists source_id uuid references public.sources (id) on delete set null;

create index if not exists notes_user_source on public.notes (user_id, source_id);

-- 기존 notes.source 텍스트 → sources 행 + source_id 연결
-- (trim만 distinct하면 "A"와 "A  "가 같은 title_normalized로 충돌 → 정규화 키로 묶음)
insert into public.sources (user_id, title)
select grouped.user_id, grouped.title
from (
  select
    n.user_id,
    lower(regexp_replace(trim(n.source), '\s+', ' ', 'g')) as norm,
    min(trim(n.source)) as title
  from public.notes n
  where length(trim(n.source)) > 0
  group by
    n.user_id,
    lower(regexp_replace(trim(n.source), '\s+', ' ', 'g'))
) grouped
where not exists (
  select 1 from public.sources s
  where s.user_id = grouped.user_id
    and s.title_normalized = grouped.norm
);

update public.notes n
set source_id = s.id
from public.sources s
where n.user_id = s.user_id
  and length(trim(n.source)) > 0
  and s.title_normalized = lower(regexp_replace(trim(n.source), '\s+', ' ', 'g'))
  and (n.source_id is null or n.source_id is distinct from s.id);

alter table public.sources enable row level security;

drop policy if exists sources_select on public.sources;
drop policy if exists sources_insert on public.sources;
drop policy if exists sources_update on public.sources;
drop policy if exists sources_delete on public.sources;

create policy sources_select on public.sources
  for select using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

create policy sources_insert on public.sources
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

create policy sources_update on public.sources
  for update using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

create policy sources_delete on public.sources
  for delete using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

grant select, insert, update, delete on table public.sources to authenticated;

notify pgrst, 'reload schema';
