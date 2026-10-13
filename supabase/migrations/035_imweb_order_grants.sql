-- 아임웹 69번 결제 → 1년 이용권 자동 부여/연장
-- SQL Editor에서 한 번 실행해도 안전합니다.

create table if not exists public.imweb_order_grants (
  order_no bigint primary key,
  orderer_email text not null,
  prod_no bigint not null default 69,
  site_code text,
  event_type text,
  user_id uuid references auth.users (id) on delete set null,
  grant_applied_at timestamptz,
  access_until_after timestamptz,
  grant_status text,
  ignore_reason text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists imweb_order_grants_email_pending_idx
  on public.imweb_order_grants (lower(orderer_email))
  where grant_applied_at is null;

comment on table public.imweb_order_grants is
  '아임웹 주문 웹훅 기록; order_no 중복 방지, 미가입 시 pending 후 가입 때 applied';
comment on column public.imweb_order_grants.grant_status is
  'applied | pending | ignored';
comment on column public.imweb_order_grants.access_until_after is
  '부여 직후 user_subscriptions.period_end';

alter table public.imweb_order_grants enable row level security;

revoke all on table public.imweb_order_grants from public;
revoke all on table public.imweb_order_grants from anon;
revoke all on table public.imweb_order_grants from authenticated;

create table if not exists public.imweb_site_connections (
  site_code text primary key,
  access_token text not null,
  refresh_token text,
  scope text,
  integration_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.imweb_site_connections is
  '아임웹 연동완료(OAuth) 후 사이트별 access token';

alter table public.imweb_site_connections enable row level security;

revoke all on table public.imweb_site_connections from public;
revoke all on table public.imweb_site_connections from anon;
revoke all on table public.imweb_site_connections from authenticated;

create or replace function public.imweb_target_prod_no()
  returns bigint
  language sql
  immutable
as $$
  select 69::bigint;
$$;

create or replace function public.imweb_extract_grant_prod_no(p_payload jsonb)
  returns bigint
  language plpgsql
  stable
  set search_path = public
as $$
declare
  v_prod bigint;
  v_top bigint;
begin
  select coalesce(
    nullif(item -> 'productInfo' ->> 'prodNo', ''),
    nullif(item ->> 'prodNo', '')
  )::bigint
  into v_prod
  from jsonb_array_elements(coalesce(p_payload -> 'sections', '[]'::jsonb)) sec,
    jsonb_array_elements(
      coalesce(sec -> 'sectionItems', sec -> 'orderSectionItems', '[]'::jsonb)
    ) item
  where coalesce(
    nullif(item -> 'productInfo' ->> 'prodNo', ''),
    nullif(item ->> 'prodNo', '')
  )::bigint = public.imweb_target_prod_no()
  limit 1;

  if v_prod is not null then
    return v_prod;
  end if;

  v_top := nullif(
    trim(coalesce(p_payload ->> 'prodNo', p_payload ->> 'prod_no', '')),
    ''
  )::bigint;

  if v_top = public.imweb_target_prod_no() then
    return v_top;
  end if;

  return null;
end;
$$;

/** period_end = max(현재 만료, 지금) + 1년, active */
create or replace function public.grant_one_year_access_for_user(
  p_user_id uuid,
  p_email text default null
)
  returns timestamptz
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_base timestamptz;
  v_until timestamptz;
begin
  if p_user_id is null then
    raise exception 'invalid user id' using errcode = '22023';
  end if;

  select s.period_end
  into v_base
  from public.user_subscriptions s
  where s.user_id = p_user_id;

  if not found then
    raise exception 'user_subscriptions not found' using errcode = 'P0002';
  end if;

  v_until := greatest(coalesce(v_base, now()), now()) + interval '1 year';

  update public.user_subscriptions s
  set
    subscription_status = 'active',
    period_end = v_until,
    email = lower(trim(coalesce(nullif(trim(p_email), ''), s.email)))
  where s.user_id = p_user_id;

  return v_until;
end;
$$;

revoke all on function public.grant_one_year_access_for_user(uuid, text) from public;
grant execute on function public.grant_one_year_access_for_user(uuid, text) to service_role;

create or replace function public.apply_pending_imweb_grants_for_email(p_email text)
  returns integer
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user_id uuid;
  v_row public.imweb_order_grants%rowtype;
  v_until timestamptz;
  v_count integer := 0;
begin
  if v_email = '' then
    return 0;
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = v_email
  limit 1;

  if v_user_id is null then
    return 0;
  end if;

  for v_row in
    select g.*
    from public.imweb_order_grants g
    where lower(g.orderer_email) = v_email
      and g.grant_applied_at is null
      and coalesce(g.grant_status, 'pending') = 'pending'
      and g.prod_no = public.imweb_target_prod_no()
    order by g.created_at asc, g.order_no asc
    for update of g
  loop
    v_until := public.grant_one_year_access_for_user(v_user_id, v_email);
    update public.imweb_order_grants g
    set
      grant_applied_at = now(),
      user_id = v_user_id,
      access_until_after = v_until,
      grant_status = 'applied',
      ignore_reason = null
    where g.order_no = v_row.order_no;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.apply_pending_imweb_grants_for_email(text) from public;
grant execute on function public.apply_pending_imweb_grants_for_email(text) to service_role;

-- 69번 주문 생성만으로 1년 부여 (결제 수단·완료 여부 무관). 가입 전이면 pending.
create or replace function public.process_imweb_order_webhook(p_payload jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, auth
as $$
declare
  v_order_no bigint;
  v_email text;
  v_site_code text;
  v_event_type text;
  v_matched_prod bigint;
  v_prod_ok boolean := false;
  v_user_id uuid;
  v_until timestamptz;
  v_existing public.imweb_order_grants%rowtype;
begin
  v_order_no := nullif(trim(coalesce(p_payload ->> 'orderNo', '')), '')::bigint;
  v_email := lower(trim(coalesce(
    nullif(p_payload ->> 'ordererEmail', ''),
    nullif(p_payload ->> 'memberUid', ''),
    ''
  )));
  v_site_code := nullif(trim(coalesce(p_payload ->> 'siteCode', '')), '');
  v_event_type := nullif(trim(coalesce(
    p_payload ->> 'event_type',
    p_payload ->> 'eventType',
    ''
  )), '');

  if v_order_no is null or v_email = '' or v_email !~ '@' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_payload');
  end if;

  v_matched_prod := public.imweb_extract_grant_prod_no(p_payload);
  v_prod_ok := v_matched_prod is not null;

  select g.*
  into v_existing
  from public.imweb_order_grants g
  where g.order_no = v_order_no;

  if found and v_existing.grant_applied_at is not null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'order_no', v_order_no,
      'prod_no', v_existing.prod_no,
      'access_until', v_existing.access_until_after
    );
  end if;

  insert into public.imweb_order_grants (
    order_no,
    orderer_email,
    prod_no,
    site_code,
    event_type,
    raw_payload,
    grant_status,
    ignore_reason
  )
  values (
    v_order_no,
    v_email,
    coalesce(v_matched_prod, public.imweb_target_prod_no()),
    v_site_code,
    v_event_type,
    p_payload,
    case when not v_prod_ok then 'ignored' else 'pending' end,
    case when not v_prod_ok then 'not_target_product' else null end
  )
  on conflict (order_no) do update
  set
    orderer_email = excluded.orderer_email,
    prod_no = excluded.prod_no,
    site_code = coalesce(excluded.site_code, public.imweb_order_grants.site_code),
    event_type = coalesce(excluded.event_type, public.imweb_order_grants.event_type),
    raw_payload = excluded.raw_payload,
    grant_status = excluded.grant_status,
    ignore_reason = excluded.ignore_reason
  where public.imweb_order_grants.grant_applied_at is null;

  if not v_prod_ok then
    return jsonb_build_object(
      'ok', true,
      'ignored', true,
      'reason', 'not_target_product',
      'order_no', v_order_no,
      'logged', true
    );
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = v_email
  limit 1;

  if v_user_id is not null then
    v_until := public.grant_one_year_access_for_user(v_user_id, v_email);
    update public.imweb_order_grants g
    set
      grant_applied_at = now(),
      user_id = v_user_id,
      access_until_after = v_until,
      grant_status = 'applied',
      ignore_reason = null
    where g.order_no = v_order_no;
    return jsonb_build_object(
      'ok', true,
      'applied', true,
      'order_no', v_order_no,
      'prod_no', v_matched_prod,
      'user_id', v_user_id,
      'access_until', v_until
    );
  end if;

  update public.imweb_order_grants g
  set grant_status = 'pending'
  where g.order_no = v_order_no;

  return jsonb_build_object(
    'ok', true,
    'pending', true,
    'order_no', v_order_no,
    'prod_no', v_matched_prod,
    'email', v_email
  );
end;
$$;

revoke all on function public.process_imweb_order_webhook(jsonb) from public;
grant execute on function public.process_imweb_order_webhook(jsonb) to service_role;

create or replace function public.handle_new_user_subscription()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, auth
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
    lower(trim(coalesce(new.email, ''))),
    'inactive',
    coalesce(new.created_at, now()),
    coalesce(new.created_at, now()) + interval '7 days'
  )
  on conflict (user_id) do nothing;

  perform public.apply_pending_imweb_grants_for_email(
    lower(trim(coalesce(new.email, '')))
  );

  return new;
end;
$$;

create or replace function public.sync_user_subscription_email()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, auth
as $$
begin
  update public.user_subscriptions
  set email = lower(trim(coalesce(new.email, '')))
  where user_id = new.id;

  perform public.apply_pending_imweb_grants_for_email(
    lower(trim(coalesce(new.email, '')))
  );

  return new;
end;
$$;
