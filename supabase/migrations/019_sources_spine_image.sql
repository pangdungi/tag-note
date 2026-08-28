-- 출처 북스파인 이미지 (교보문고 등에서 복사·붙여넣기)
alter table public.sources
  add column if not exists spine_image_url text,
  add column if not exists spine_image_width integer,
  add column if not exists spine_image_height integer;

comment on column public.sources.spine_image_url is '출처 북스파인 이미지 (data URL 또는 URL)';
comment on column public.sources.spine_image_width is '북스파인 이미지 원본 너비(px)';
comment on column public.sources.spine_image_height is '북스파인 이미지 원본 높이(px)';
