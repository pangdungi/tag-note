-- 출처 별점·도서평
alter table public.sources
  add column if not exists rating smallint,
  add column if not exists review text;

alter table public.sources
  drop constraint if exists sources_rating_range;

alter table public.sources
  add constraint sources_rating_range
  check (rating is null or (rating >= 1 and rating <= 5));

comment on column public.sources.rating is '1~5 별점';
comment on column public.sources.review is '도서평·한줄 평가';

notify pgrst, 'reload schema';
