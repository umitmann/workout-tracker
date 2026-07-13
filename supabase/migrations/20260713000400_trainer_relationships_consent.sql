-- Phase 3: bilateral trainer relationships, trainee-controlled consent, and
-- append-only audit history. This migration deliberately does not expose any
-- workout, set, routine, note, or bodyweight data to a trainer.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists private;
revoke all on schema private from PUBLIC, anon, authenticated, service_role;

create table public.trainer_relationships (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users (id) on delete cascade,
  trainee_id uuid not null references auth.users (id) on delete cascade,
  initiated_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending',
  trainer_accepted_at timestamp with time zone,
  trainee_accepted_at timestamp with time zone,
  activated_at timestamp with time zone,
  ended_at timestamp with time zone,
  ended_by uuid references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint trainer_relationships_distinct_parties
    check (trainer_id <> trainee_id),
  constraint trainer_relationships_initiator_is_party
    check (initiated_by in (trainer_id, trainee_id)),
  constraint trainer_relationships_ender_is_party
    check (ended_by is null or ended_by in (trainer_id, trainee_id)),
  constraint trainer_relationships_supported_status
    check (status in ('pending', 'active', 'declined', 'ended', 'expired')),
  constraint trainer_relationships_timestamp_order
    check (
      (trainer_accepted_at is null or trainer_accepted_at >= created_at)
      and (trainee_accepted_at is null or trainee_accepted_at >= created_at)
      and (activated_at is null or activated_at >= created_at)
      and (ended_at is null or ended_at >= created_at)
      and updated_at >= created_at
    ),
  constraint trainer_relationships_state_consistency
    check (
      (
        status = 'pending'
        and num_nonnulls(trainer_accepted_at, trainee_accepted_at) = 1
        and activated_at is null
        and ended_at is null
        and ended_by is null
      )
      or
      (
        status = 'active'
        and trainer_accepted_at is not null
        and trainee_accepted_at is not null
        and activated_at is not null
        and activated_at >= greatest(trainer_accepted_at, trainee_accepted_at)
        and ended_at is null
        and ended_by is null
      )
      or
      (
        status = 'declined'
        and num_nonnulls(trainer_accepted_at, trainee_accepted_at) = 1
        and activated_at is null
        and ended_at is not null
        and ended_by is not null
        and ended_by <> initiated_by
      )
      or
      (
        status = 'ended'
        and ended_at is not null
        and ended_by is not null
        and (
          (
            num_nonnulls(trainer_accepted_at, trainee_accepted_at) = 1
            and activated_at is null
          )
          or
          (
            trainer_accepted_at is not null
            and trainee_accepted_at is not null
            and activated_at is not null
            and activated_at >= greatest(trainer_accepted_at, trainee_accepted_at)
          )
        )
      )
      or
      (
        status = 'expired'
        and num_nonnulls(trainer_accepted_at, trainee_accepted_at) = 1
        and activated_at is null
        and ended_at is not null
        and ended_by is null
      )
    )
);

create unique index trainer_relationships_one_current_pair_idx
  on public.trainer_relationships (trainer_id, trainee_id)
  where status in ('pending', 'active');

create index trainer_relationships_trainer_status_idx
  on public.trainer_relationships (trainer_id, status, created_at desc);

create index trainer_relationships_trainee_status_idx
  on public.trainer_relationships (trainee_id, status, created_at desc);

create table public.trainer_access_grants (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null
    references public.trainer_relationships (id) on delete cascade,
  permission text not null,
  granted_by uuid not null references auth.users (id) on delete cascade,
  granted_at timestamp with time zone not null default now(),
  resource_date_from date,
  resource_date_to date,
  revoked_at timestamp with time zone,
  revoked_by uuid references auth.users (id) on delete cascade,
  constraint trainer_access_grants_supported_permission
    check (permission in ('workout_results.read', 'bodyweight.read')),
  constraint trainer_access_grants_date_range
    check (
      resource_date_from is null
      or resource_date_to is null
      or resource_date_from <= resource_date_to
    ),
  constraint trainer_access_grants_revocation_consistency
    check (
      (revoked_at is null and revoked_by is null)
      or
      (revoked_at is not null and revoked_by is not null and revoked_at >= granted_at)
    )
);

create unique index trainer_access_grants_one_active_permission_idx
  on public.trainer_access_grants (relationship_id, permission)
  where revoked_at is null;

create index trainer_access_grants_relationship_history_idx
  on public.trainer_access_grants (relationship_id, permission, granted_at desc);

-- Audit identifiers intentionally have no cascading foreign keys. Account
-- deletion can remove operational relationship data without rewriting the
-- append-only audit ledger. Audit rows are never exposed as raw table rows.
create table public.trainer_relationship_audit_events (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null,
  actor_id uuid,
  actor_role text not null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint trainer_relationship_audit_actor_role
    check (actor_role in ('trainer', 'trainee', 'system')),
  constraint trainer_relationship_audit_event_type
    check (
      event_type in (
        'relationship.requested',
        'relationship.accepted',
        'relationship.activated',
        'relationship.declined',
        'relationship.ended',
        'access.granted',
        'access.revoked'
      )
    ),
  constraint trainer_relationship_audit_details_object
    check (jsonb_typeof(details) = 'object')
);

create index trainer_relationship_audit_timeline_idx
  on public.trainer_relationship_audit_events (relationship_id, created_at, id);

create trigger trainer_relationships_set_updated_at
before update on public.trainer_relationships
for each row execute function private.set_updated_at();

-- Cross-table provenance is enforced even for operational writes. A grant
-- must originate with the relationship's trainee; a revoker must be a party.
create or replace function private.validate_trainer_access_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_relationship public.trainer_relationships%rowtype;
begin
  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = new.relationship_id;

  if not found or new.granted_by <> v_relationship.trainee_id then
    raise exception using errcode = '23514', message = 'grant must be authored by the trainee';
  end if;

  if new.revoked_by is not null
     and new.revoked_by not in (v_relationship.trainer_id, v_relationship.trainee_id) then
    raise exception using errcode = '23514', message = 'grant revoker must be a relationship party';
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_trainer_access_grant()
  from PUBLIC, anon, authenticated, service_role;

create trigger trainer_access_grants_validate_provenance
before insert or update on public.trainer_access_grants
for each row execute function private.validate_trainer_access_grant();

create or replace function private.prevent_trainer_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000', message = 'trainer relationship audit is append-only';
end;
$function$;

revoke all on function private.prevent_trainer_audit_mutation()
  from PUBLIC, anon, authenticated, service_role;

create trigger trainer_relationship_audit_prevent_mutation
before update or delete on public.trainer_relationship_audit_events
for each row execute function private.prevent_trainer_audit_mutation();

create or replace function private.append_trainer_relationship_audit(
  p_relationship_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.trainer_relationship_audit_events (
    relationship_id,
    actor_id,
    actor_role,
    event_type,
    details
  )
  values (
    p_relationship_id,
    p_actor_id,
    p_actor_role,
    p_event_type,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$function$;

revoke all on function private.append_trainer_relationship_audit(uuid, uuid, text, text, jsonb)
  from PUBLIC, anon, authenticated, service_role;

alter table public.trainer_relationships enable row level security;
alter table public.trainer_access_grants enable row level security;
alter table public.trainer_relationship_audit_events enable row level security;

-- There are intentionally no authenticated base-table policies. Participants
-- receive minimal DTOs and mutate state only through the functions below.
revoke all on table
  public.trainer_relationships,
  public.trainer_access_grants,
  public.trainer_relationship_audit_events
from PUBLIC, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.trainer_relationships,
  public.trainer_access_grants
to service_role;

grant select, insert on table public.trainer_relationship_audit_events
  to service_role;

create or replace function public.request_trainer_relationship(
  p_trainer_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_trainer_id uuid;
  v_relationship_id uuid;
  v_now timestamp with time zone := statement_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_trainer_profile_id is null then
    raise exception using errcode = '22023', message = 'trainer profile id is required';
  end if;

  select trainer.user_id
  into v_trainer_id
  from public.trainer_profiles as trainer
  where trainer.id = p_trainer_profile_id
    and trainer.verification_status = 'approved'
    and trainer.listing_status = 'published'
    and trainer.accepting_clients = true
  for share;

  if not found then
    raise exception using errcode = 'P0002', message = 'trainer is not available for requests';
  end if;

  if v_trainer_id = v_actor then
    raise exception using errcode = '22023', message = 'an account cannot train itself';
  end if;

  insert into public.trainer_relationships (
    trainer_id,
    trainee_id,
    initiated_by,
    status,
    trainee_accepted_at,
    created_at,
    updated_at
  )
  values (
    v_trainer_id,
    v_actor,
    v_actor,
    'pending',
    v_now,
    v_now,
    v_now
  )
  returning id into v_relationship_id;

  perform private.append_trainer_relationship_audit(
    v_relationship_id,
    v_actor,
    'trainee',
    'relationship.requested',
    pg_catalog.jsonb_build_object('initiated_by_role', 'trainee')
  );

  return v_relationship_id;
end;
$function$;

create or replace function public.accept_trainer_relationship(
  p_relationship_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_relationship public.trainer_relationships%rowtype;
  v_actor_role text;
  v_now timestamp with time zone := statement_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_relationship_id is null then
    raise exception using errcode = '22023', message = 'relationship id is required';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id
  for update;

  if not found
     or v_relationship.status <> 'pending'
     or v_actor not in (v_relationship.trainer_id, v_relationship.trainee_id)
     or v_actor = v_relationship.initiated_by then
    raise exception using errcode = '42501', message = 'relationship acceptance is not allowed';
  end if;

  if not exists (
    select 1
    from public.trainer_profiles as trainer
    where trainer.user_id = v_relationship.trainer_id
      and trainer.verification_status = 'approved'
  ) then
    raise exception using errcode = '42501', message = 'trainer is not approved';
  end if;

  if v_actor = v_relationship.trainer_id then
    if v_relationship.trainer_accepted_at is not null then
      raise exception using errcode = '55000', message = 'relationship was already accepted';
    end if;
    v_actor_role := 'trainer';
  else
    if v_relationship.trainee_accepted_at is not null then
      raise exception using errcode = '55000', message = 'relationship was already accepted';
    end if;
    v_actor_role := 'trainee';
  end if;

  update public.trainer_relationships
  set
    trainer_accepted_at = case
      when v_actor = v_relationship.trainer_id then v_now
      else trainer_accepted_at
    end,
    trainee_accepted_at = case
      when v_actor = v_relationship.trainee_id then v_now
      else trainee_accepted_at
    end,
    status = 'active',
    activated_at = v_now
  where id = p_relationship_id;

  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    v_actor,
    v_actor_role,
    'relationship.accepted'
  );
  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    v_actor,
    v_actor_role,
    'relationship.activated'
  );
end;
$function$;

create or replace function public.decline_trainer_relationship(
  p_relationship_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_relationship public.trainer_relationships%rowtype;
  v_actor_role text;
  v_now timestamp with time zone := statement_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_relationship_id is null then
    raise exception using errcode = '22023', message = 'relationship id is required';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id
  for update;

  if not found
     or v_relationship.status <> 'pending'
     or v_actor not in (v_relationship.trainer_id, v_relationship.trainee_id)
     or v_actor = v_relationship.initiated_by then
    raise exception using errcode = '42501', message = 'relationship decline is not allowed';
  end if;

  v_actor_role := case
    when v_actor = v_relationship.trainer_id then 'trainer'
    else 'trainee'
  end;

  update public.trainer_relationships
  set
    status = 'declined',
    ended_at = v_now,
    ended_by = v_actor
  where id = p_relationship_id;

  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    v_actor,
    v_actor_role,
    'relationship.declined'
  );
end;
$function$;

create or replace function public.end_trainer_relationship(
  p_relationship_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_relationship public.trainer_relationships%rowtype;
  v_grant public.trainer_access_grants%rowtype;
  v_actor_role text;
  v_now timestamp with time zone := statement_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_relationship_id is null then
    raise exception using errcode = '22023', message = 'relationship id is required';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id
  for update;

  if not found
     or v_relationship.status not in ('pending', 'active')
     or v_actor not in (v_relationship.trainer_id, v_relationship.trainee_id) then
    raise exception using errcode = '42501', message = 'relationship end is not allowed';
  end if;

  v_actor_role := case
    when v_actor = v_relationship.trainer_id then 'trainer'
    else 'trainee'
  end;

  for v_grant in
    select grant_row.*
    from public.trainer_access_grants as grant_row
    where grant_row.relationship_id = p_relationship_id
      and grant_row.revoked_at is null
    for update
  loop
    update public.trainer_access_grants
    set
      revoked_at = v_now,
      revoked_by = v_actor
    where relationship_id = p_relationship_id
      and revoked_at is null
      and id = v_grant.id;

    perform private.append_trainer_relationship_audit(
      p_relationship_id,
      v_actor,
      v_actor_role,
      'access.revoked',
      pg_catalog.jsonb_build_object(
        'permission', v_grant.permission,
        'reason', 'relationship_ended'
      )
    );
  end loop;

  update public.trainer_relationships
  set
    status = 'ended',
    ended_at = v_now,
    ended_by = v_actor
  where id = p_relationship_id;

  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    v_actor,
    v_actor_role,
    'relationship.ended'
  );
end;
$function$;

create or replace function public.grant_trainer_access(
  p_relationship_id uuid,
  p_permission text,
  p_history_scope text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_relationship public.trainer_relationships%rowtype;
  v_existing public.trainer_access_grants%rowtype;
  v_permission text := pg_catalog.lower(pg_catalog.btrim(p_permission));
  v_history_scope text := pg_catalog.lower(pg_catalog.btrim(p_history_scope));
  v_resource_date_from date;
  v_grant_id uuid;
  v_now timestamp with time zone := statement_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_relationship_id is null
     or v_permission is null
     or v_permission not in ('workout_results.read', 'bodyweight.read')
     or v_history_scope is null
     or v_history_scope not in ('all', 'from_now') then
    raise exception using errcode = '22023', message = 'invalid trainer access grant';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id
  for update;

  if not found
     or v_relationship.trainee_id <> v_actor
     or v_relationship.status <> 'active' then
    raise exception using errcode = '42501', message = 'trainer access grant is not allowed';
  end if;

  if not exists (
    select 1
    from public.trainer_profiles as trainer
    where trainer.user_id = v_relationship.trainer_id
      and trainer.verification_status = 'approved'
  ) then
    raise exception using errcode = '42501', message = 'trainer is not approved';
  end if;

  if v_history_scope = 'from_now' then
    select (v_now at time zone profile.time_zone)::date
    into v_resource_date_from
    from public.profiles as profile
    where profile.user_id = v_actor;

    if not found then
      raise exception using errcode = 'P0002', message = 'trainee profile not found';
    end if;
  else
    v_resource_date_from := null;
  end if;

  select grant_row.*
  into v_existing
  from public.trainer_access_grants as grant_row
  where grant_row.relationship_id = p_relationship_id
    and grant_row.permission = v_permission
    and grant_row.revoked_at is null
  for update;

  if found
     and v_existing.resource_date_from is not distinct from v_resource_date_from
     and v_existing.resource_date_to is null then
    return v_existing.id;
  end if;

  if found then
    update public.trainer_access_grants
    set
      revoked_at = v_now,
      revoked_by = v_actor
    where relationship_id = p_relationship_id
      and permission = v_permission
      and revoked_at is null;

    perform private.append_trainer_relationship_audit(
      p_relationship_id,
      v_actor,
      'trainee',
      'access.revoked',
      pg_catalog.jsonb_build_object(
        'permission', v_permission,
        'reason', 'scope_changed'
      )
    );
  end if;

  insert into public.trainer_access_grants (
    relationship_id,
    permission,
    granted_by,
    granted_at,
    resource_date_from,
    resource_date_to
  )
  values (
    p_relationship_id,
    v_permission,
    v_actor,
    v_now,
    v_resource_date_from,
    null
  )
  returning id into v_grant_id;

  perform private.append_trainer_relationship_audit(
    p_relationship_id,
    v_actor,
    'trainee',
    'access.granted',
    pg_catalog.jsonb_build_object(
      'permission', v_permission,
      'history_scope', v_history_scope
    )
  );

  return v_grant_id;
end;
$function$;

create or replace function public.revoke_trainer_access(
  p_relationship_id uuid,
  p_permission text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_relationship public.trainer_relationships%rowtype;
  v_permission text := pg_catalog.lower(pg_catalog.btrim(p_permission));
  v_grant_id uuid;
  v_now timestamp with time zone := statement_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_relationship_id is null
     or v_permission is null
     or v_permission not in ('workout_results.read', 'bodyweight.read') then
    raise exception using errcode = '22023', message = 'invalid trainer access revocation';
  end if;

  select relationship.*
  into v_relationship
  from public.trainer_relationships as relationship
  where relationship.id = p_relationship_id
  for update;

  if not found
     or v_relationship.trainee_id <> v_actor
     or v_relationship.status <> 'active' then
    raise exception using errcode = '42501', message = 'trainer access revocation is not allowed';
  end if;

  update public.trainer_access_grants
  set
    revoked_at = v_now,
    revoked_by = v_actor
  where relationship_id = p_relationship_id
    and permission = v_permission
    and revoked_at is null
  returning id into v_grant_id;

  if found then
    perform private.append_trainer_relationship_audit(
      p_relationship_id,
      v_actor,
      'trainee',
      'access.revoked',
      pg_catalog.jsonb_build_object(
        'permission', v_permission,
        'reason', 'trainee_revoked'
      )
    );
  end if;
end;
$function$;

create or replace function public.list_my_trainer_relationships()
returns table (
  relationship_id uuid,
  trainer_profile_id uuid,
  counterparty_display_name text,
  counterparty_avatar_url text,
  my_role text,
  status text,
  initiated_by_me boolean,
  awaiting_my_response boolean,
  created_at timestamp with time zone,
  activated_at timestamp with time zone,
  ended_at timestamp with time zone,
  workout_results_access boolean,
  workout_results_date_from date,
  bodyweight_access boolean,
  bodyweight_date_from date
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  return query
  select
    relationship.id,
    trainer.id,
    case
      when relationship.trainee_id = v_actor then trainer.display_name
      else trainee_profile.display_name
    end,
    case
      when relationship.trainee_id = v_actor then trainer.avatar_url
      else trainee_profile.avatar_url
    end,
    case
      when relationship.trainer_id = v_actor then 'trainer'::text
      else 'trainee'::text
    end,
    relationship.status,
    relationship.initiated_by = v_actor,
    relationship.status = 'pending'
      and relationship.initiated_by <> v_actor,
    relationship.created_at,
    relationship.activated_at,
    relationship.ended_at,
    coalesce(access.workout_results_access, false),
    access.workout_results_date_from,
    coalesce(access.bodyweight_access, false),
    access.bodyweight_date_from
  from public.trainer_relationships as relationship
  join public.trainer_profiles as trainer
    on trainer.user_id = relationship.trainer_id
  join public.profiles as trainee_profile
    on trainee_profile.user_id = relationship.trainee_id
  left join lateral (
    select
      pg_catalog.bool_or(grant_row.permission = 'workout_results.read')
        as workout_results_access,
      pg_catalog.max(grant_row.resource_date_from)
        filter (where grant_row.permission = 'workout_results.read')
        as workout_results_date_from,
      pg_catalog.bool_or(grant_row.permission = 'bodyweight.read')
        as bodyweight_access,
      pg_catalog.max(grant_row.resource_date_from)
        filter (where grant_row.permission = 'bodyweight.read')
        as bodyweight_date_from
    from public.trainer_access_grants as grant_row
    where grant_row.relationship_id = relationship.id
      and grant_row.revoked_at is null
  ) as access on true
  where relationship.trainer_id = v_actor
     or relationship.trainee_id = v_actor
  order by
    case relationship.status
      when 'pending' then 0
      when 'active' then 1
      else 2
    end,
    relationship.created_at desc,
    relationship.id;
end;
$function$;

create or replace function public.list_trainer_relationship_audit(
  p_relationship_id uuid
)
returns table (
  event_type text,
  actor_role text,
  details jsonb,
  occurred_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_relationship_id is null then
    raise exception using errcode = '22023', message = 'relationship id is required';
  end if;

  if not exists (
    select 1
    from public.trainer_relationships as relationship
    where relationship.id = p_relationship_id
      and v_actor in (relationship.trainer_id, relationship.trainee_id)
  ) then
    raise exception using errcode = '42501', message = 'relationship audit is not available';
  end if;

  return query
  select
    event.event_type,
    event.actor_role,
    event.details,
    event.created_at
  from public.trainer_relationship_audit_events as event
  where event.relationship_id = p_relationship_id
  order by event.created_at, event.id;
end;
$function$;

revoke all on function public.request_trainer_relationship(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.accept_trainer_relationship(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.decline_trainer_relationship(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.end_trainer_relationship(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.grant_trainer_access(uuid, text, text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.revoke_trainer_access(uuid, text)
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.list_my_trainer_relationships()
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.list_trainer_relationship_audit(uuid)
  from PUBLIC, anon, authenticated, service_role;

grant execute on function public.request_trainer_relationship(uuid) to authenticated;
grant execute on function public.accept_trainer_relationship(uuid) to authenticated;
grant execute on function public.decline_trainer_relationship(uuid) to authenticated;
grant execute on function public.end_trainer_relationship(uuid) to authenticated;
grant execute on function public.grant_trainer_access(uuid, text, text) to authenticated;
grant execute on function public.revoke_trainer_access(uuid, text) to authenticated;
grant execute on function public.list_my_trainer_relationships() to authenticated;
grant execute on function public.list_trainer_relationship_audit(uuid) to authenticated;

comment on table public.trainer_relationships is
  'Bilateral trainer/trainee state. Base rows are private; transitions use narrow RPCs.';
comment on table public.trainer_access_grants is
  'Trainee-authored, independently revocable category grants. A relationship alone grants no result access.';
comment on table public.trainer_relationship_audit_events is
  'Append-only internal consent history exposed to participants only through a minimal DTO.';

notify pgrst, 'reload schema';

commit;

select
  to_regclass('public.trainer_relationships') is not null
    and to_regclass('public.trainer_access_grants') is not null
    and to_regclass('public.trainer_relationship_audit_events') is not null
    as three_consent_tables_created,
  not has_table_privilege('anon', 'public.trainer_relationships', 'select')
    and not has_table_privilege('anon', 'public.trainer_access_grants', 'select')
    and not has_table_privilege('anon', 'public.trainer_relationship_audit_events', 'select')
    as anonymous_consent_table_access_denied,
  not has_table_privilege('authenticated', 'public.trainer_relationships', 'select')
    and not has_table_privilege('authenticated', 'public.trainer_relationships', 'insert')
    and not has_table_privilege('authenticated', 'public.trainer_access_grants', 'select')
    and not has_table_privilege('authenticated', 'public.trainer_access_grants', 'insert')
    and not has_table_privilege('authenticated', 'public.trainer_relationship_audit_events', 'select')
    as authenticated_base_table_access_denied,
  (
    select pg_catalog.bool_and(
      procedure.prosecdef
      and exists (
        select 1
        from pg_catalog.unnest(procedure.proconfig) as config(setting)
        where setting like 'search_path=%'
          and setting not like '%public%'
      )
    )
    from pg_catalog.pg_proc as procedure
    where procedure.oid in (
      'public.request_trainer_relationship(uuid)'::regprocedure,
      'public.accept_trainer_relationship(uuid)'::regprocedure,
      'public.decline_trainer_relationship(uuid)'::regprocedure,
      'public.end_trainer_relationship(uuid)'::regprocedure,
      'public.grant_trainer_access(uuid,text,text)'::regprocedure,
      'public.revoke_trainer_access(uuid,text)'::regprocedure,
      'public.list_my_trainer_relationships()'::regprocedure,
      'public.list_trainer_relationship_audit(uuid)'::regprocedure
    )
  ) as all_consent_rpcs_are_hardened,
  has_function_privilege(
    'authenticated',
    'public.request_trainer_relationship(uuid)',
    'execute'
  )
    and has_function_privilege(
      'authenticated',
      'public.list_my_trainer_relationships()',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.request_trainer_relationship(uuid)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.request_trainer_relationship(uuid)',
      'execute'
    )
    as consent_rpc_permissions_are_scoped,
  exists (
    select 1
    from pg_catalog.pg_indexes as index_row
    where index_row.schemaname = 'public'
      and index_row.indexname = 'trainer_relationships_one_current_pair_idx'
  ) as one_current_relationship_is_enforced,
  exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    where trigger_row.tgname = 'trainer_relationship_audit_prevent_mutation'
      and not trigger_row.tgisinternal
  ) as audit_append_only_trigger_installed,
  (
    select count(*)
    from public.trainer_relationships
    where status in ('pending', 'active')
  ) as current_relationship_count,
  (select count(*) from public.trainer_access_grants where revoked_at is null)
    as active_access_grant_count,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count,
  (select count(*) from public.body_weights) as stored_bodyweight_count;
