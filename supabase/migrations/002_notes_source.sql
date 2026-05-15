-- 기존 프로젝트에 적용: SQL Editor에서 실행
alter table public.notes
  add column if not exists source text not null default '';

comment on column public.notes.source is '출처(링크, 서적, 기사 등)';
