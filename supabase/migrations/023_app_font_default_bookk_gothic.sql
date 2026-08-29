-- 기본 앱 글꼴을 북크고딕으로 변경 (신규 사용자·기본값)

alter table public.user_preferences
alter column app_font_id set default 'bookk_gothic_bold';
