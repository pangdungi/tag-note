-- 계정별 UI 설정 (글꼴 등)
-- SQL Editor에서 한 번 실행해도 안전합니다.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  app_font_id text not null default 'system'
    check (
      app_font_id in (
        'system',
        'leeseoyun',
        'donoun_medium',
        'adultkid',
        'pak_yong_jun'
      )
    ),
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is '사용자별 UI 설정(글꼴 등)';
comment on column public.user_preferences.app_font_id is 'AccountModal에서 선택한 앱 글꼴 ID';

create or replace function public.set_user_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at
  before update on public.user_preferences
  for each row
  execute function public.set_user_preferences_updated_at();

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select on public.user_preferences;
drop policy if exists user_preferences_insert on public.user_preferences;
drop policy if exists user_preferences_update on public.user_preferences;

create policy user_preferences_select on public.user_preferences
  for select using (auth.uid() = user_id);

create policy user_preferences_insert on public.user_preferences
  for insert with check (auth.uid() = user_id);

create policy user_preferences_update on public.user_preferences
  for update using (auth.uid() = user_id);

grant select, insert, update on table public.user_preferences to authenticated;

-- 기존 사용자 백필
insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- 신규 가입 시 기본 행
create or replace function public.handle_new_user_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_user_preferences on auth.users;
create trigger on_auth_user_created_user_preferences
  after insert on auth.users
  for each row
  execute function public.handle_new_user_preferences();
