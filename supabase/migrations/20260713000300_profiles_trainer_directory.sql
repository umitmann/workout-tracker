-- Phase 2: private account profiles, public-safe trainer listings, and
-- platform administration. This migration is additive: it does not alter
-- workouts, sets, routines, routine_exercises, or body measurements.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists private;
revoke all on schema private from PUBLIC, anon, authenticated, service_role;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  time_zone text not null default 'UTC',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 80),
  constraint profiles_avatar_url_length
    check (avatar_url is null or char_length(btrim(avatar_url)) between 1 and 2048),
  constraint profiles_time_zone_length
    check (char_length(btrim(time_zone)) between 1 and 100)
);

create table public.trainer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  bio text not null default '',
  specialties text[] not null default '{}'::text[],
  remote_available boolean not null default false,
  location_text text,
  accepting_clients boolean not null default false,
  listing_status text not null default 'draft',
  verification_status text not null default 'pending',
  reviewed_at timestamp with time zone,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint trainer_profiles_display_name_length
    check (char_length(btrim(display_name)) between 1 and 80),
  constraint trainer_profiles_avatar_url_length
    check (
      avatar_url is null
      or (
        char_length(btrim(avatar_url)) between 1 and 2048
        and avatar_url ~ '^https://'
      )
    ),
  constraint trainer_profiles_bio_length
    check (char_length(bio) <= 2000),
  constraint trainer_profiles_specialties_count
    check (cardinality(specialties) <= 20),
  constraint trainer_profiles_location_length
    check (location_text is null or char_length(btrim(location_text)) between 1 and 120),
  constraint trainer_profiles_listing_status
    check (listing_status in ('draft', 'published', 'paused')),
  constraint trainer_profiles_verification_status
    check (verification_status in ('pending', 'approved', 'rejected', 'suspended')),
  constraint trainer_profiles_review_provenance
    check (
      (verification_status = 'pending' and reviewed_at is null and reviewed_by is null)
      or
      (verification_status <> 'pending' and reviewed_at is not null)
    )
);

create table public.platform_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamp with time zone not null default now(),
  primary key (user_id, role),
  constraint platform_roles_supported_role
    check (role = 'platform_admin')
);

create index trainer_profiles_directory_idx
  on public.trainer_profiles (accepting_clients desc, display_name, id)
  where verification_status = 'approved' and listing_status = 'published';

create index trainer_profiles_specialties_gin_idx
  on public.trainer_profiles using gin (specialties);

-- Central timestamp trigger. It is not exposed through the Data API.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$function$;

revoke all on function private.set_updated_at() from PUBLIC, anon, authenticated, service_role;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger trainer_profiles_set_updated_at
before update on public.trainer_profiles
for each row execute function private.set_updated_at();

-- Supabase recommends a trigger-backed public profile because auth.users is
-- not exposed through the Data API. Inputs from user metadata are bounded so
-- malformed metadata cannot violate profile constraints and block signup.
create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_display_name text;
  v_avatar_url text;
begin
  v_display_name := pg_catalog.left(
    coalesce(
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      'User'
    ),
    80
  );

  v_avatar_url := case
    when nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'avatar_url'), '') is null
      then null
    else pg_catalog.left(pg_catalog.btrim(new.raw_user_meta_data ->> 'avatar_url'), 2048)
  end;

  insert into public.profiles (user_id, display_name, avatar_url, time_zone)
  values (new.id, v_display_name, v_avatar_url, 'UTC')
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

revoke all on function private.handle_new_user_profile()
  from PUBLIC, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function private.handle_new_user_profile();

-- Backfill existing accounts without copying email addresses or other private
-- auth fields into the application profile.
insert into public.profiles (user_id, display_name, avatar_url, time_zone)
select
  auth_user.id,
  pg_catalog.left(
    coalesce(
      nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
      nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      'User'
    ),
    80
  ),
  case
    when nullif(pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'avatar_url'), '') is null
      then null
    else pg_catalog.left(
      pg_catalog.btrim(auth_user.raw_user_meta_data ->> 'avatar_url'),
      2048
    )
  end,
  'UTC'
from auth.users as auth_user
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;
alter table public.trainer_profiles enable row level security;
alter table public.platform_roles enable row level security;

create policy "profiles: read own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles: update own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "trainer_profiles: read own base row"
  on public.trainer_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Base-table access fails closed. Another user can discover only the safe DTO
-- returned by trainer_directory_search/get, never user_id or review metadata.
revoke all on table public.profiles, public.trainer_profiles, public.platform_roles
  from PUBLIC, anon, authenticated, service_role;

grant select on table public.profiles to authenticated;
grant select on table public.trainer_profiles to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.trainer_profiles,
  public.platform_roles
to service_role;

-- Unexposed helper for current-state platform authorization. Platform role
-- membership never implies access to workouts, sets, or body measurements.
create or replace function private.is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null
    and exists (
      select 1
      from public.platform_roles as membership
      where membership.user_id = p_user_id
        and membership.role = 'platform_admin'
    );
$function$;

revoke all on function private.is_platform_admin(uuid)
  from PUBLIC, anon, authenticated, service_role;

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.is_platform_admin(auth.uid());
$function$;

create or replace function public.save_my_profile(
  p_display_name text,
  p_avatar_url text,
  p_time_zone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_avatar_url text := nullif(pg_catalog.btrim(p_avatar_url), '');
  v_time_zone text := pg_catalog.btrim(p_time_zone);
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if v_display_name is null or char_length(v_display_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'display name must contain 1 to 80 characters';
  end if;

  if v_avatar_url is not null and char_length(v_avatar_url) > 2048 then
    raise exception using errcode = '22023', message = 'avatar URL must contain at most 2048 characters';
  end if;

  if v_time_zone is null
     or char_length(v_time_zone) > 100
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names as time_zone
       where time_zone.name = v_time_zone
     ) then
    raise exception using errcode = '22023', message = 'time zone must be a valid IANA time zone';
  end if;

  update public.profiles
  set
    display_name = v_display_name,
    avatar_url = v_avatar_url,
    time_zone = v_time_zone
  where user_id = v_actor;

  if not found then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;
end;
$function$;

-- Trainer self-service cannot write verification or review columns. Rejected
-- applications are moved back to pending when resubmitted; suspended profiles
-- remain suspended and paused until an administrator reviews them.
create or replace function public.save_trainer_profile(
  p_display_name text,
  p_bio text,
  p_specialties text[],
  p_remote_available boolean,
  p_location_text text,
  p_accepting_clients boolean,
  p_listing_status text,
  p_avatar_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_bio text := coalesce(pg_catalog.btrim(p_bio), '');
  v_location_text text := nullif(pg_catalog.btrim(p_location_text), '');
  v_avatar_url text := nullif(pg_catalog.btrim(p_avatar_url), '');
  v_listing_status text := pg_catalog.lower(pg_catalog.btrim(p_listing_status));
  v_specialties text[];
  v_profile_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if v_display_name is null or char_length(v_display_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'display name must contain 1 to 80 characters';
  end if;

  if char_length(v_bio) > 2000 then
    raise exception using errcode = '22023', message = 'bio must contain at most 2000 characters';
  end if;

  if v_location_text is not null and char_length(v_location_text) > 120 then
    raise exception using errcode = '22023', message = 'location must contain at most 120 characters';
  end if;

  if v_avatar_url is not null and char_length(v_avatar_url) > 2048 then
    raise exception using errcode = '22023', message = 'avatar URL must contain at most 2048 characters';
  end if;

  if v_avatar_url is not null and v_avatar_url !~ '^https://' then
    raise exception using errcode = '22023', message = 'trainer avatar URL must use HTTPS';
  end if;

  if p_remote_available is null or p_accepting_clients is null then
    raise exception using errcode = '22023', message = 'trainer availability flags are required';
  end if;

  if v_listing_status is null
     or v_listing_status not in ('draft', 'published', 'paused') then
    raise exception using errcode = '22023', message = 'invalid trainer listing status';
  end if;

  if p_specialties is null or cardinality(p_specialties) > 20 or exists (
    select 1
    from unnest(coalesce(p_specialties, '{}'::text[])) as specialty(value)
    where value is null
      or char_length(pg_catalog.btrim(value)) not between 1 and 40
      or pg_catalog.lower(pg_catalog.btrim(value)) !~ '^[a-z0-9]+([_-][a-z0-9]+)*$'
  ) then
    raise exception using errcode = '22023', message = 'invalid trainer specialties';
  end if;

  select coalesce(
    pg_catalog.array_agg(
      distinct pg_catalog.lower(pg_catalog.btrim(specialty.value))
      order by pg_catalog.lower(pg_catalog.btrim(specialty.value))
    ),
    '{}'::text[]
  )
  into v_specialties
  from unnest(p_specialties) as specialty(value);

  insert into public.trainer_profiles as existing (
    user_id,
    display_name,
    avatar_url,
    bio,
    specialties,
    remote_available,
    location_text,
    accepting_clients,
    listing_status
  )
  values (
    v_actor,
    v_display_name,
    v_avatar_url,
    v_bio,
    v_specialties,
    p_remote_available,
    v_location_text,
    p_accepting_clients,
    v_listing_status
  )
  on conflict (user_id) do update
  set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    bio = excluded.bio,
    specialties = excluded.specialties,
    remote_available = excluded.remote_available,
    location_text = excluded.location_text,
    accepting_clients = excluded.accepting_clients,
    listing_status = case
      when existing.verification_status = 'suspended' then 'paused'
      else excluded.listing_status
    end,
    verification_status = case
      when existing.verification_status = 'rejected' then 'pending'
      else existing.verification_status
    end,
    reviewed_at = case
      when existing.verification_status = 'rejected' then null
      else existing.reviewed_at
    end,
    reviewed_by = case
      when existing.verification_status = 'rejected' then null
      else existing.reviewed_by
    end
  returning existing.id into v_profile_id;

  return v_profile_id;
end;
$function$;

create or replace function public.trainer_directory_search(
  p_query text default null,
  p_specialty text default null,
  p_remote boolean default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  bio text,
  specialties text[],
  remote_available boolean,
  location_text text,
  accepting_clients boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_query text := nullif(pg_catalog.btrim(p_query), '');
  v_specialty text := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_specialty)),
    ''
  );
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if (v_query is not null and char_length(v_query) > 100)
     or (v_specialty is not null and char_length(v_specialty) > 40)
     or p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'invalid trainer directory query';
  end if;

  return query
  select
    trainer.id,
    trainer.display_name,
    trainer.avatar_url,
    trainer.bio,
    trainer.specialties,
    trainer.remote_available,
    trainer.location_text,
    trainer.accepting_clients
  from public.trainer_profiles as trainer
  where trainer.verification_status = 'approved'
    and trainer.listing_status = 'published'
    and (p_remote is null or trainer.remote_available = p_remote)
    and (v_specialty is null or v_specialty = any (trainer.specialties))
    and (
      v_query is null
      or pg_catalog.strpos(pg_catalog.lower(trainer.display_name), pg_catalog.lower(v_query)) > 0
      or pg_catalog.strpos(pg_catalog.lower(trainer.bio), pg_catalog.lower(v_query)) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(trainer.location_text, '')),
        pg_catalog.lower(v_query)
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.array_to_string(trainer.specialties, ' ')),
        pg_catalog.lower(v_query)
      ) > 0
    )
  order by trainer.accepting_clients desc, trainer.display_name, trainer.id
  limit p_limit
  offset p_offset;
end;
$function$;

create or replace function public.trainer_directory_get(p_profile_id uuid)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  bio text,
  specialties text[],
  remote_available boolean,
  location_text text,
  accepting_clients boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_profile_id is null then
    raise exception using errcode = '22023', message = 'trainer profile id is required';
  end if;

  return query
  select
    trainer.id,
    trainer.display_name,
    trainer.avatar_url,
    trainer.bio,
    trainer.specialties,
    trainer.remote_available,
    trainer.location_text,
    trainer.accepting_clients
  from public.trainer_profiles as trainer
  where trainer.id = p_profile_id
    and trainer.verification_status = 'approved'
    and trainer.listing_status = 'published';
end;
$function$;

create or replace function public.admin_list_trainer_profiles(
  p_verification_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  bio text,
  specialties text[],
  remote_available boolean,
  location_text text,
  accepting_clients boolean,
  listing_status text,
  verification_status text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_status text := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_verification_status)),
    ''
  );
begin
  if not private.is_platform_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'platform administrator required';
  end if;

  if (v_status is not null and v_status not in ('pending', 'approved', 'rejected', 'suspended'))
     or p_limit is null or p_limit not between 1 and 100
     or p_offset is null or p_offset not between 0 and 10000 then
    raise exception using errcode = '22023', message = 'invalid trainer review query';
  end if;

  return query
  select
    trainer.id,
    trainer.display_name,
    trainer.avatar_url,
    trainer.bio,
    trainer.specialties,
    trainer.remote_available,
    trainer.location_text,
    trainer.accepting_clients,
    trainer.listing_status,
    trainer.verification_status,
    trainer.reviewed_at,
    trainer.created_at,
    trainer.updated_at
  from public.trainer_profiles as trainer
  where v_status is null or trainer.verification_status = v_status
  order by trainer.created_at, trainer.id
  limit p_limit
  offset p_offset;
end;
$function$;

create or replace function public.admin_set_trainer_verification(
  p_profile_id uuid,
  p_verification_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_status text := pg_catalog.lower(pg_catalog.btrim(p_verification_status));
begin
  if not private.is_platform_admin(v_actor) then
    raise exception using errcode = '42501', message = 'platform administrator required';
  end if;

  if p_profile_id is null
     or v_status is null
     or v_status not in ('approved', 'rejected', 'suspended') then
    raise exception using errcode = '22023', message = 'invalid trainer verification transition';
  end if;

  update public.trainer_profiles
  set
    verification_status = v_status,
    reviewed_at = statement_timestamp(),
    reviewed_by = v_actor,
    listing_status = case
      when v_status in ('rejected', 'suspended') then
        case when v_status = 'rejected' then 'draft' else 'paused' end
      else listing_status
    end
  where id = p_profile_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'trainer profile not found';
  end if;
end;
$function$;

revoke all on function public.current_user_is_platform_admin()
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.save_my_profile(text, text, text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.save_trainer_profile(text, text, text[], boolean, text, boolean, text, text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.trainer_directory_search(text, text, boolean, integer, integer)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.trainer_directory_get(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.admin_list_trainer_profiles(text, integer, integer)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.admin_set_trainer_verification(uuid, text)
  from PUBLIC, anon, authenticated, service_role;

grant execute on function public.current_user_is_platform_admin() to authenticated;
grant execute on function public.save_my_profile(text, text, text) to authenticated;
grant execute on function public.save_trainer_profile(text, text, text[], boolean, text, boolean, text, text)
  to authenticated;
grant execute on function public.trainer_directory_search(text, text, boolean, integer, integer)
  to authenticated;
grant execute on function public.trainer_directory_get(uuid) to authenticated;
grant execute on function public.admin_list_trainer_profiles(text, integer, integer)
  to authenticated;
grant execute on function public.admin_set_trainer_verification(uuid, text)
  to authenticated;

comment on table public.profiles is
  'Private owner-only application profiles; never use as a public directory.';
comment on table public.trainer_profiles is
  'Trainer listing source. Other users access only approved/published safe DTO RPCs.';
comment on table public.platform_roles is
  'Platform operations only; membership does not grant health or workout data access.';

notify pgrst, 'reload schema';

commit;

select
  to_regclass('public.profiles') is not null
    and to_regclass('public.trainer_profiles') is not null
    and to_regclass('public.platform_roles') is not null
    as three_foundation_tables_created,
  (select count(*) from public.profiles) = (select count(*) from auth.users)
    as every_auth_user_has_profile,
  not has_table_privilege('anon', 'public.profiles', 'select')
    and not has_table_privilege('anon', 'public.trainer_profiles', 'select')
    and not has_table_privilege('anon', 'public.platform_roles', 'select')
    as anonymous_table_access_denied,
  has_table_privilege('authenticated', 'public.profiles', 'select')
    and not has_table_privilege('authenticated', 'public.profiles', 'update')
    and has_function_privilege(
      'authenticated',
      'public.save_my_profile(text,text,text)',
      'execute'
    )
    as authenticated_profile_access_is_scoped,
  has_table_privilege('authenticated', 'public.trainer_profiles', 'select')
    and not has_table_privilege('authenticated', 'public.trainer_profiles', 'insert')
    and not has_table_privilege('authenticated', 'public.trainer_profiles', 'update')
    as trainer_base_table_is_owner_read_only,
  not has_table_privilege('authenticated', 'public.platform_roles', 'select')
    and not has_table_privilege('authenticated', 'public.platform_roles', 'insert')
    as platform_roles_not_directly_exposed,
  has_function_privilege(
    'authenticated',
    'public.trainer_directory_search(text,text,boolean,integer,integer)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'public.trainer_directory_search(text,text,boolean,integer,integer)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.trainer_directory_search(text,text,boolean,integer,integer)',
      'execute'
    )
    as directory_rpc_permissions_are_scoped,
  (
    select bool_and(
      procedure.prosecdef
      and exists (
        select 1
        from unnest(procedure.proconfig) as config(setting)
        where setting like 'search_path=%'
          and setting not like '%public%'
      )
    )
    from pg_proc as procedure
    where procedure.oid in (
      'public.current_user_is_platform_admin()'::regprocedure,
      'public.save_my_profile(text,text,text)'::regprocedure,
      'public.save_trainer_profile(text,text,text[],boolean,text,boolean,text,text)'::regprocedure,
      'public.trainer_directory_search(text,text,boolean,integer,integer)'::regprocedure,
      'public.trainer_directory_get(uuid)'::regprocedure,
      'public.admin_list_trainer_profiles(text,integer,integer)'::regprocedure,
      'public.admin_set_trainer_verification(uuid,text)'::regprocedure
    )
  ) as all_public_rpcs_are_hardened,
  (select count(*) from public.platform_roles) as platform_role_count,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count,
  (select count(*) from public.routines) as stored_routine_count,
  (select count(*) from public.routine_exercises) as stored_routine_exercise_count;
