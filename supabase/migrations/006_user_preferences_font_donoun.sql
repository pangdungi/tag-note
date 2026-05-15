-- 글꼴 옵션: 온글잎 류뚱체 제거 → Donoun Medium ID로 교체
-- 기존 DB에 이미 적용된 005 이후 실행.

update public.user_preferences
set app_font_id = 'donoun_medium'
where app_font_id = 'ongeulip_ryuttung';

alter table public.user_preferences
drop constraint if exists user_preferences_app_font_id_check;

alter table public.user_preferences
add constraint user_preferences_app_font_id_check check (
  app_font_id in (
    'system',
    'leeseoyun',
    'donoun_medium',
    'adultkid',
    'pak_yong_jun'
  )
);
