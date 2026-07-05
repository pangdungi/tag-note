-- 계정 글꼴 선택: 그리운·온글잎
-- 주의: 기존 check 제약을 먼저 제거한 뒤 값을 마이그레이션해야 함 (spoqa/dos_gothic → griun_myeonheullim)

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

comment on column public.user_preferences.app_font_id is
  'AccountModal에서 선택한 앱 글꼴 ID (griun_myeonheullim 등)';
