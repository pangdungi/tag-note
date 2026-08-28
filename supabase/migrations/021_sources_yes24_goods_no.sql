-- 예스24 Open API 상품 번호
alter table public.sources
  add column if not exists yes24_goods_no text;

comment on column public.sources.yes24_goods_no is '예스24 itemId (GOODS_NO)';

comment on column public.sources.metadata_source is 'yes24 | manual 등';
