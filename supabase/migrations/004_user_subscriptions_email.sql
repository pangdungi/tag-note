-- 이미 옛날 003만 실행했다면: user_subscriptions에 email 추가·동기화
-- SQL Editor에서 실행 (여러 번 실행해도 무방한 구간 위주)

alter table public.user_subscriptions
  add column if not exists email text;

comment on column public.user_subscriptions.email is 'auth.users.email 스냅샷·관리자 식별용';

-- 가입 트리거: email 포함
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

-- 기존 행 이메일 채우기
update public.user_subscriptions s
set email = u.email
from auth.users u
where s.user_id = u.id
  and (s.email is distinct from u.email or s.email is null);

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
