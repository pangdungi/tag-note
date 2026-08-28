-- 태그에 연결된 질문(워크시트: 질문명 + 대답, 대답은 비워둘 수 있음)
create table if not exists public.tag_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  question text not null,
  answer text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tag_questions_question_not_empty check (length(trim(question)) > 0)
);

create index if not exists tag_questions_user_tag_created
  on public.tag_questions (user_id, tag_id, created_at desc);

create or replace function public.set_tag_questions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tag_questions_updated_at on public.tag_questions;
create trigger tag_questions_updated_at
  before update on public.tag_questions
  for each row
  execute function public.set_tag_questions_updated_at();

alter table public.tag_questions enable row level security;

drop policy if exists tag_questions_select on public.tag_questions;
drop policy if exists tag_questions_insert on public.tag_questions;
drop policy if exists tag_questions_update on public.tag_questions;
drop policy if exists tag_questions_delete on public.tag_questions;

create policy tag_questions_select on public.tag_questions
  for select using (auth.uid() = user_id);
create policy tag_questions_insert on public.tag_questions
  for insert with check (auth.uid() = user_id);
create policy tag_questions_update on public.tag_questions
  for update using (auth.uid() = user_id);
create policy tag_questions_delete on public.tag_questions
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on table public.tag_questions to authenticated;

comment on table public.tag_questions is '태그별 질문 워크시트 (질문 + 선택적 대답)';

-- 테이블 생성 직후 PostgREST 스키마 캐시 갱신 (필수)
notify pgrst, 'reload schema';
