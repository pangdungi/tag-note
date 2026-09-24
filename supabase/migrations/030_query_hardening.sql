-- 전량 select 없이 출처 이동·일괄 태그·태그없음 개수

create or replace function public.normalize_source_title(raw text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(coalesce(raw, ''), '\s+', ' ', 'g')));
$$;

create or replace function public.untagged_memo_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint
  from public.notes n
  where n.user_id = auth.uid()
    and not exists (
      select 1 from public.note_tags nt where nt.note_id = n.id
    );
$$;

create or replace function public.bulk_add_tag_to_tagged_notes(
  source_tag uuid,
  target_tag uuid
)
returns table (note_id uuid)
language sql
volatile
security invoker
set search_path = public
as $$
  insert into public.note_tags (note_id, tag_id, user_id)
  select nt.note_id, target_tag, auth.uid()
  from public.note_tags nt
  where nt.user_id = auth.uid()
    and nt.tag_id = source_tag
    and not exists (
      select 1
      from public.note_tags x
      where x.note_id = nt.note_id
        and x.tag_id = target_tag
    )
  returning note_tags.note_id;
$$;

create or replace function public.clear_source_from_own_notes(p_source_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  src_key text;
begin
  select public.normalize_source_title(s.title)
  into src_key
  from public.sources s
  where s.id = p_source_id
    and s.user_id = auth.uid();

  update public.notes
  set source = '', source_id = null
  where user_id = auth.uid()
    and source_id = p_source_id;

  if src_key is not null then
    update public.notes
    set source = ''
    where user_id = auth.uid()
      and source_id is null
      and public.normalize_source_title(source) = src_key;
  end if;

  delete from public.sources
  where id = p_source_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.move_own_notes_to_source(
  p_from_id uuid,
  p_to_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  from_key text;
  to_title text;
begin
  if p_from_id = p_to_id then
    raise exception '같은 출처로는 옮길 수 없습니다.';
  end if;

  select public.normalize_source_title(s.title)
  into from_key
  from public.sources s
  where s.id = p_from_id
    and s.user_id = auth.uid();

  select s.title
  into to_title
  from public.sources s
  where s.id = p_to_id
    and s.user_id = auth.uid();

  if to_title is null then
    raise exception '옮길 출처를 찾을 수 없습니다.';
  end if;

  update public.notes
  set source = to_title, source_id = p_to_id
  where user_id = auth.uid()
    and source_id = p_from_id;

  if from_key is not null then
    update public.notes
    set source = to_title, source_id = p_to_id
    where user_id = auth.uid()
      and source_id is null
      and public.normalize_source_title(source) = from_key;
  end if;
end;
$$;

grant execute on function public.normalize_source_title(text) to authenticated;
grant execute on function public.untagged_memo_count() to authenticated;
grant execute on function public.bulk_add_tag_to_tagged_notes(uuid, uuid) to authenticated;
grant execute on function public.clear_source_from_own_notes(uuid) to authenticated;
grant execute on function public.move_own_notes_to_source(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
