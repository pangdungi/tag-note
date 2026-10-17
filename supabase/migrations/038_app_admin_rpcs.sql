-- 관리자(앱 기본 관리자 이메일)만 구독·아임웹 주문·탈퇴 기록 조회/수정.
-- src/lib/adminAccess.ts 의 DEFAULT_APP_ADMIN_EMAIL 과 동기화.

create or replace function public.tn_app_admin_email()
  returns text
  language sql
  immutable
  parallel safe
as $func$
  select 'dbsgpwls416@gmail.com'::text;
$func$;

create or replace function public.tn_is_app_admin()
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = public, auth
as $func$
begin
  return lower(trim(coalesce((auth.jwt() ->> 'email')::text, '')))
    = lower(trim(public.tn_app_admin_email()));
end;
$func$;

comment on function public.tn_is_app_admin() is
  'JWT 이메일이 앱 기본 관리자와 같으면 true';

create or replace function public.tn_admin_list_subscriptions()
  returns table (
    user_id uuid,
    email text,
    subscription_status text,
    period_start timestamptz,
    period_end timestamptz,
    signup_at timestamptz,
    access_until timestamptz
  )
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
begin
  if not public.tn_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select
      s.user_id,
      s.email,
      s.subscription_status,
      s.period_start,
      s.period_end,
      s.period_start as signup_at,
      s.period_end as access_until
    from public.user_subscriptions s
    order by lower(s.email) asc nulls last, s.user_id;
end;
$func$;

create or replace function public.tn_admin_grant_one_year(p_user_id uuid)
  returns table (
    user_id uuid,
    email text,
    subscription_status text,
    period_start timestamptz,
    period_end timestamptz,
    signup_at timestamptz,
    access_until timestamptz
  )
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
begin
  if not public.tn_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'invalid user id' using errcode = '22023';
  end if;

  update public.user_subscriptions s
  set
    subscription_status = 'active',
    period_end = s.period_start + interval '1 year'
  where s.user_id = p_user_id;

  if not found then
    raise exception 'user_subscriptions not found' using errcode = 'P0002';
  end if;

  return query
    select
      s.user_id,
      s.email,
      s.subscription_status,
      s.period_start,
      s.period_end,
      s.period_start as signup_at,
      s.period_end as access_until
    from public.user_subscriptions s
    where s.user_id = p_user_id;
end;
$func$;

create or replace function public.tn_admin_set_subscription(
  p_user_id uuid,
  p_subscription_status text,
  p_access_until timestamptz
)
  returns table (
    user_id uuid,
    email text,
    subscription_status text,
    period_start timestamptz,
    period_end timestamptz,
    signup_at timestamptz,
    access_until timestamptz
  )
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
declare
  st text;
begin
  if not public.tn_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_user_id is null or p_access_until is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  st := lower(trim(coalesce(p_subscription_status, '')));
  if st not in ('active', 'inactive') then
    raise exception 'invalid subscription status' using errcode = '22023';
  end if;

  update public.user_subscriptions s
  set
    subscription_status = st,
    period_end = p_access_until
  where s.user_id = p_user_id;

  if not found then
    raise exception 'user_subscriptions not found' using errcode = 'P0002';
  end if;

  return query
    select
      s.user_id,
      s.email,
      s.subscription_status,
      s.period_start,
      s.period_end,
      s.period_start as signup_at,
      s.period_end as access_until
    from public.user_subscriptions s
    where s.user_id = p_user_id;
end;
$func$;

create or replace function public.tn_admin_list_imweb_order_grants()
  returns table (
    order_no bigint,
    orderer_email text,
    prod_no bigint,
    user_id uuid,
    grant_status text,
    grant_applied_at timestamptz,
    access_until_after timestamptz,
    created_at timestamptz
  )
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
begin
  if not public.tn_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select
      g.order_no,
      g.orderer_email,
      g.prod_no,
      g.user_id,
      g.grant_status,
      g.grant_applied_at,
      g.access_until_after,
      g.created_at
    from public.imweb_order_grants g
    order by g.created_at desc nulls last, g.order_no desc;
end;
$func$;

create table if not exists public.user_deletion_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  email text not null default '',
  deleted_at timestamptz not null default now()
);

comment on table public.user_deletion_log is
  '탈퇴한 회원 이메일·UID·탈퇴 시각(관리자 전용 조회)';

create index if not exists user_deletion_log_deleted_at_idx
  on public.user_deletion_log (deleted_at desc);
create index if not exists user_deletion_log_email_lower_idx
  on public.user_deletion_log (lower(email));

alter table public.user_deletion_log enable row level security;

revoke all on table public.user_deletion_log from public;
revoke all on table public.user_deletion_log from anon;
revoke all on table public.user_deletion_log from authenticated;

create or replace function public.tn_admin_list_user_deletions()
  returns table (
    id bigint,
    user_id uuid,
    email text,
    deleted_at timestamptz
  )
  language plpgsql
  security definer
  set search_path = public, auth
as $func$
begin
  if not public.tn_is_app_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select d.id, d.user_id, d.email, d.deleted_at
    from public.user_deletion_log d
    order by d.deleted_at desc, d.id desc;
end;
$func$;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
  v_email text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception '로그인이 필요합니다';
  end if;

  select coalesce(u.email, '')
    into v_email
  from auth.users u
  where u.id = uid;

  insert into public.user_deletion_log (user_id, email)
  values (uid, coalesce(v_email, ''));

  delete from auth.users
  where id = uid;
end;
$$;

comment on function public.delete_own_account() is
  '로그인한 사용자 본인의 auth.users 행을 삭제합니다. 탈퇴 기록은 user_deletion_log 에 남깁니다.';

revoke all on function public.tn_app_admin_email() from public;
revoke all on function public.tn_is_app_admin() from public;
revoke all on function public.tn_admin_list_subscriptions() from public;
revoke all on function public.tn_admin_grant_one_year(uuid) from public;
revoke all on function public.tn_admin_set_subscription(uuid, text, timestamptz) from public;
revoke all on function public.tn_admin_list_imweb_order_grants() from public;
revoke all on function public.tn_admin_list_user_deletions() from public;
revoke all on function public.delete_own_account() from public;

grant execute on function public.tn_app_admin_email() to service_role;
grant execute on function public.tn_is_app_admin() to authenticated;
grant execute on function public.tn_admin_list_subscriptions() to authenticated;
grant execute on function public.tn_admin_grant_one_year(uuid) to authenticated;
grant execute on function public.tn_admin_set_subscription(uuid, text, timestamptz) to authenticated;
grant execute on function public.tn_admin_list_imweb_order_grants() to authenticated;
grant execute on function public.tn_admin_list_user_deletions() to authenticated;
grant execute on function public.delete_own_account() to authenticated;
