-- 사용자별 구독 상태·이용 기간 (가입 시 7일 체험 자동 등록)
-- SQL Editor에서 한 번 실행해도 안전합니다.

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  subscription_status text not null
    check (subscription_status in ('active', 'inactive')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_period_order check (period_start <= period_end)
);

comment on table public.user_subscriptions is '사용자 구독 상태 및 이용 가능 기간(체험/유료 공통)';
comment on column public.user_subscriptions.subscription_status is 'active=유료 구독 등, inactive=체험 등 비구독 상태';
comment on column public.user_subscriptions.period_start is '이용 구간 시작(포함)';
comment on column public.user_subscriptions.period_end is '이용 구간 종료(포함)';
comment on column public.user_subscriptions.email is 'auth.users.email 스냅샷·관리자 식별용';

create or replace function public.set_user_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_subscriptions_updated_at on public.user_subscriptions;
create trigger user_subscriptions_updated_at
  before update on public.user_subscriptions
  for each row
  execute function public.set_user_subscriptions_updated_at();

-- 신규 가입: 7일 체험(inactive), 기간 = 가입 시점 기준 7일
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_subscriptions (
    user_id,
    email,
    subscription_status,
    period_start,
    period_end
  )
  values (
    new.id,
    new.email,
    'inactive',
    coalesce(new.created_at, now()),
    coalesce(new.created_at, now()) + interval '7 days'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_user_subscription on auth.users;
create trigger on_auth_user_created_user_subscription
  after insert on auth.users
  for each row
  execute function public.handle_new_user_subscription();

-- auth 이메일 변경 시 user_subscriptions.email 동기화
create or replace function public.sync_user_subscription_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_subscriptions
  set email = new.email
  where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated_email_subscription on auth.users;
create trigger on_auth_user_updated_email_subscription
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_user_subscription_email();

-- 기존 계정 백필 (행이 없을 때만, 가입일 기준 7일 체험 구간)
insert into public.user_subscriptions (
  user_id,
  email,
  subscription_status,
  period_start,
  period_end
)
select
  u.id,
  u.email,
  'inactive',
  u.created_at,
  u.created_at + interval '7 days'
from auth.users u
where not exists (
  select 1 from public.user_subscriptions s where s.user_id = u.id
);

alter table public.user_subscriptions enable row level security;

drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
create policy user_subscriptions_select_own on public.user_subscriptions
  for select using (auth.uid() = user_id);

grant select on table public.user_subscriptions to authenticated;

-- 앱·API 접근: 현재 시각이 이용 기간 안일 때만 노트/태그 조작 허용
drop policy if exists tags_select on public.tags;
drop policy if exists tags_insert on public.tags;
drop policy if exists tags_update on public.tags;
drop policy if exists tags_delete on public.tags;

create policy tags_select on public.tags
  for select using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );
create policy tags_insert on public.tags
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );
create policy tags_update on public.tags
  for update using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );
create policy tags_delete on public.tags
  for delete using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

drop policy if exists notes_select on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;

create policy notes_select on public.notes
  for select using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );
create policy notes_insert on public.notes
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );
create policy notes_update on public.notes
  for update using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );
create policy notes_delete on public.notes
  for delete using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

drop policy if exists note_tags_select on public.note_tags;
drop policy if exists note_tags_insert on public.note_tags;
drop policy if exists note_tags_delete on public.note_tags;

create policy note_tags_select on public.note_tags
  for select using (
    exists (
      select 1 from public.notes n
      where n.id = note_tags.note_id and n.user_id = auth.uid()
    )
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
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
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

create policy note_tags_delete on public.note_tags
  for delete using (
    exists (
      select 1 from public.notes n
      where n.id = note_tags.note_id and n.user_id = auth.uid()
    )
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );
