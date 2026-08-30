-- 계정에서 고를 수 있는 글꼴을 그리운 프롬솔·이서윤체로 좁힙니다.

alter table public.user_preferences
drop constraint if exists user_preferences_app_font_id_check;

update public.user_preferences
set app_font_id = 'griun_fromsol'
where app_font_id is null
   or app_font_id not in ('griun_fromsol', 'leeseoyun');

alter table public.user_preferences
alter column app_font_id set default 'griun_fromsol';

alter table public.user_preferences
add constraint user_preferences_app_font_id_check check (
  app_font_id in ('griun_fromsol', 'leeseoyun')
);
