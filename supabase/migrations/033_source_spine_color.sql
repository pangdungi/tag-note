-- 텍스트 북스파인·직접 등록 책의 표지/스파인 색

alter table public.sources
  add column if not exists spine_color text;

alter table public.sources
  drop constraint if exists sources_spine_color_hex;

alter table public.sources
  add constraint sources_spine_color_hex
  check (
    spine_color is null
    or spine_color ~ '^#[0-9A-Fa-f]{6}$'
  );

notify pgrst, 'reload schema';
