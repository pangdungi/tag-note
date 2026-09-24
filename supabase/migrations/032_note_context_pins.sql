-- 폴더·출처 목록 전용 고정. notes.is_pinned(허브 고정 보드)와 별개.

create table if not exists public.note_context_pins (
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  context_kind text not null check (context_kind in ('folder', 'source')),
  context_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, note_id, context_kind, context_id)
);

create index if not exists note_context_pins_scope
  on public.note_context_pins (user_id, context_kind, context_id);

alter table public.note_context_pins enable row level security;

drop policy if exists note_context_pins_select on public.note_context_pins;
drop policy if exists note_context_pins_insert on public.note_context_pins;
drop policy if exists note_context_pins_delete on public.note_context_pins;

create policy note_context_pins_select on public.note_context_pins
  for select using (auth.uid() = user_id);

create policy note_context_pins_insert on public.note_context_pins
  for insert with check (auth.uid() = user_id);

create policy note_context_pins_delete on public.note_context_pins
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.note_context_pins to authenticated;
