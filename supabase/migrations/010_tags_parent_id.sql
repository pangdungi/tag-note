-- 태그 상위–하위 (1단계만). 기존 태그는 parent_id NULL 그대로.
alter table public.tags
  add column if not exists parent_id uuid references public.tags (id) on delete set null;

create index if not exists tags_user_parent on public.tags (user_id, parent_id);

create or replace function public.check_tag_parent_rules()
returns trigger
language plpgsql
as $$
declare
  parent_row public.tags%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'tag cannot be its own parent';
  end if;

  select * into parent_row from public.tags where id = new.parent_id;
  if not found then
    raise exception 'parent tag not found';
  end if;
  if parent_row.user_id is distinct from new.user_id then
    raise exception 'parent tag must belong to same user';
  end if;
  if parent_row.parent_id is not null then
    raise exception 'only one level of tag hierarchy allowed';
  end if;

  if exists (
    select 1 from public.tags where parent_id = new.id and id is distinct from new.id
  ) then
    raise exception 'tag with children cannot be assigned a parent';
  end if;

  return new;
end;
$$;

drop trigger if exists tags_parent_rules on public.tags;
create trigger tags_parent_rules
  before insert or update of parent_id on public.tags
  for each row
  execute function public.check_tag_parent_rules();
