-- 기본·저장 글꼴을 북크고딕에서 그리운 프롬솔(두들)로 바꿉니다.

alter table public.user_preferences
drop constraint if exists user_preferences_app_font_id_check;

update public.user_preferences
set app_font_id = 'griun_fromsol'
where app_font_id = 'bookk_gothic_bold'
   or app_font_id is null
   or app_font_id not in (
     'griun_fromsol',
     'griun_myeonheullim',
     'ongeulip_gongbujalhajana',
     'ongeulip_ryuryu',
     'griun_mongtori',
     'griun_cherry1spoon',
     'griun_cocochoitoon'
   );

alter table public.user_preferences
alter column app_font_id set default 'griun_fromsol';

alter table public.user_preferences
add constraint user_preferences_app_font_id_check check (
  app_font_id in (
    'griun_fromsol',
    'griun_myeonheullim',
    'ongeulip_gongbujalhajana',
    'ongeulip_ryuryu',
    'griun_mongtori',
    'griun_cherry1spoon',
    'griun_cocochoitoon'
  )
);
