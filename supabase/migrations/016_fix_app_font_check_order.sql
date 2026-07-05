-- 014 실행 시 check 제약 때문에 griun_myeonheullim UPDATE가 실패한 DB 복구용
-- Supabase SQL Editor에서 014가 실패했다면 이 파일만 실행해도 됩니다.

alter table public.user_preferences
drop constraint if exists user_preferences_app_font_id_check;

update public.user_preferences
set app_font_id = 'griun_myeonheullim'
where app_font_id is null
   or app_font_id not in (
     'griun_myeonheullim',
     'ongeulip_gongbujalhajana',
     'ongeulip_ryuryu',
     'griun_mongtori',
     'griun_cherry1spoon',
     'griun_cocochoitoon'
   );

alter table public.user_preferences
alter column app_font_id set default 'griun_myeonheullim';

alter table public.user_preferences
add constraint user_preferences_app_font_id_check check (
  app_font_id in (
    'griun_myeonheullim',
    'ongeulip_gongbujalhajana',
    'ongeulip_ryuryu',
    'griun_mongtori',
    'griun_cherry1spoon',
    'griun_cocochoitoon'
  )
);
