-- 레거시 UI 글꼴 설정 제거 → spoqa 고정
update public.user_preferences
set app_font_id = 'spoqa'
where app_font_id is distinct from 'spoqa'
  and app_font_id is distinct from 'dos_gothic';

alter table public.user_preferences
drop constraint if exists user_preferences_app_font_id_check;

alter table public.user_preferences
add constraint user_preferences_app_font_id_check check (
  app_font_id in ('spoqa', 'dos_gothic')
);
