-- DOS Gothic 글꼴 옵션 제거 (014 이후 idempotent)
alter table public.user_preferences
drop constraint if exists user_preferences_app_font_id_check;

update public.user_preferences
set app_font_id = 'griun_myeonheullim'
where app_font_id = 'dos_gothic';

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
