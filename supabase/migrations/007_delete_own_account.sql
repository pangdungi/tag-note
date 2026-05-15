-- 회원 탈퇴: public 쪽은 auth.users FK의 ON DELETE CASCADE로 함께 삭제되고,
-- 본 호출에서 auth.users·연결된 auth.identities 등 auth 처리.
-- SQL Editor에서 한 번 실행해도 안전합니다.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception '로그인이 필요합니다';
  end if;

  delete from auth.users
  where id = uid;
end;
$$;

comment on function public.delete_own_account() is
  '로그인한 사용자 본인의 auth.users 행을 삭제합니다. notes/tags/note_tags/user_subscriptions/user_preferences 등은 FK CASCADE로 정리됩니다.';

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
