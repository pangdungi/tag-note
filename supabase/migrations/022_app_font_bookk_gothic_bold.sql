-- 북크고딕 Bold 글꼴 선택지 추가

alter table public.user_preferences
drop constraint if exists user_preferences_app_font_id_check;

alter table public.user_preferences
add constraint user_preferences_app_font_id_check check (
  app_font_id in (
    'griun_myeonheullim',
    'ongeulip_gongbujalhajana',
    'ongeulip_ryuryu',
    'griun_mongtori',
    'griun_cherry1spoon',
    'griun_cocochoitoon',
    'bookk_gothic_bold'
  )
);
