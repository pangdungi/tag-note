-- 출처(책) — ISBN·서지 메타데이터·표지
alter table public.sources
  add column if not exists isbn text,
  add column if not exists author text,
  add column if not exists publisher text,
  add column if not exists published_year integer,
  add column if not exists category text,
  add column if not exists cover_image_url text,
  add column if not exists kyobo_product_id text,
  add column if not exists metadata_source text;

create unique index if not exists sources_user_isbn_unique
  on public.sources (user_id, isbn)
  where isbn is not null and length(trim(isbn)) > 0;

comment on column public.sources.isbn is 'ISBN-13';
comment on column public.sources.cover_image_url is '표지 이미지 URL (추후 UI 활용)';
comment on column public.sources.kyobo_product_id is '교보문고 saleCmdtId';
comment on column public.sources.metadata_source is 'kakao | kyobo | manual 등';
