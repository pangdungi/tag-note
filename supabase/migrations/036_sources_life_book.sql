-- 인생책 — 북스파인 위 마크 표시
alter table public.sources
  add column if not exists is_life_book boolean not null default false;

comment on column public.sources.is_life_book is
  '인생책. 책장(전체·분류·개인) 북스파인 위에 마크를 띄운다';

notify pgrst, 'reload schema';
