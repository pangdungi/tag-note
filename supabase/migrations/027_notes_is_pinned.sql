-- 계정별 고정 메모. notes.user_id + RLS로 유저마다 따로 묶입니다.

alter table public.notes
add column if not exists is_pinned boolean not null default false;

create index if not exists notes_user_is_pinned_idx
  on public.notes (user_id)
  where is_pinned;
