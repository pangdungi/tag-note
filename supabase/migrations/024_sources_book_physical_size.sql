alter table public.sources
  add column if not exists book_width_mm integer,
  add column if not exists book_length_mm integer,
  add column if not exists book_height_mm integer;

comment on column public.sources.book_width_mm is '책 가로(mm), 예스24 width';
comment on column public.sources.book_length_mm is '책 세로(mm), 예스24 length — 책장에 세웠을 때 높이';
comment on column public.sources.book_height_mm is '책 두께(mm), 예스24 height';
