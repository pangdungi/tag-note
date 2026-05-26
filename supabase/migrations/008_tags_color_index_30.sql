-- 태그 색상 인덱스: 파스텔 무지개 30톤 (0..29)
alter table public.tags drop constraint if exists tags_color_index_check;

alter table public.tags
  add constraint tags_color_index_check
  check (color_index >= 0 and color_index < 30);

-- 기존 태그도 30톤 중 무작위로 다시 배정 (한번 실행)
update public.tags
set color_index = floor(random() * 30)::smallint;
