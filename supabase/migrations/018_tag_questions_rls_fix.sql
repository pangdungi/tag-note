-- tag_questions: insert 후 returning select 가 RLS에 막히는 경우 방지
-- (이미 017을 실행했다면 이 파일만 추가로 실행)

alter table public.tag_questions enable row level security;

drop policy if exists tag_questions_select on public.tag_questions;
drop policy if exists tag_questions_insert on public.tag_questions;
drop policy if exists tag_questions_update on public.tag_questions;
drop policy if exists tag_questions_delete on public.tag_questions;

create policy tag_questions_select on public.tag_questions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy tag_questions_insert on public.tag_questions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy tag_questions_update on public.tag_questions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy tag_questions_delete on public.tag_questions
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.tag_questions to authenticated;

notify pgrst, 'reload schema';
