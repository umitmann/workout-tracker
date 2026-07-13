-- ONE-TIME OPERATOR ACTION — do not add this file to the migration chain.
-- Run only after 20260713000300_profiles_trainer_directory.sql succeeds.
-- Replace the placeholder with the email address of the account that should
-- receive platform administration authority.

begin;

do $bootstrap$
declare
  v_email text := 'REPLACE_WITH_YOUR_LOGIN_EMAIL';
  v_user_id uuid;
  v_match_count integer;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'replace the platform-admin email placeholder with a valid login email';
  end if;

  select count(*)
  into v_match_count
  from auth.users as auth_user
  where pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(v_email));

  if v_match_count <> 1 then
    raise exception 'expected exactly one auth user for %, found %', v_email, v_match_count;
  end if;

  select auth_user.id
  into strict v_user_id
  from auth.users as auth_user
  where pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(v_email));

  insert into public.platform_roles (user_id, role, granted_by)
  values (v_user_id, 'platform_admin', v_user_id)
  on conflict (user_id, role) do nothing;
end;
$bootstrap$;

commit;

select
  auth_user.email,
  membership.role,
  membership.granted_at
from public.platform_roles as membership
join auth.users as auth_user on auth_user.id = membership.user_id
where membership.role = 'platform_admin'
order by membership.granted_at;
