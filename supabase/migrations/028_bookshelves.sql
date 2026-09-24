-- 사용자 책장 + 출처(책) 배정
create table if not exists public.bookshelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  name_normalized text generated always as (
    lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  ) stored,
  constraint bookshelves_name_not_empty check (length(trim(name)) > 0)
);

create unique index if not exists bookshelves_user_name_norm
  on public.bookshelves (user_id, name_normalized);
create index if not exists bookshelves_user_created
  on public.bookshelves (user_id, created_at desc);

alter table public.sources
  add column if not exists bookshelf_id uuid references public.bookshelves (id) on delete set null;

create index if not exists sources_user_bookshelf
  on public.sources (user_id, bookshelf_id);

alter table public.bookshelves enable row level security;

drop policy if exists bookshelves_select on public.bookshelves;
drop policy if exists bookshelves_insert on public.bookshelves;
drop policy if exists bookshelves_update on public.bookshelves;
drop policy if exists bookshelves_delete on public.bookshelves;

create policy bookshelves_select on public.bookshelves
  for select using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

create policy bookshelves_insert on public.bookshelves
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

create policy bookshelves_update on public.bookshelves
  for update using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

create policy bookshelves_delete on public.bookshelves
  for delete using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_subscriptions s
      where s.user_id = auth.uid()
        and now() >= s.period_start
        and now() <= s.period_end
    )
  );

grant select, insert, update, delete on table public.bookshelves to authenticated;

notify pgrst, 'reload schema';
