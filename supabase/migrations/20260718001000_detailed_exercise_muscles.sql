-- Phase 20: OpenSim-grounded, detailed exercise-muscle metadata.
--
-- This is deliberately additive. `muscles` and `muscles_secondary` remain the
-- stable mobile/filtering contract; the new arrays refine the desktop anatomy
-- without changing existing workout, routine, set, or plan rows.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists private.exercise_muscle_taxonomy (
  key text primary key,
  label text not null,
  broad_muscle text not null,
  region text not null check (region in (
    'head-neck', 'torso', 'upper-arm', 'forearm-hand', 'hip-thigh', 'lower-leg-foot'
  )),
  opensim_model text,
  opensim_actuators text[] not null default '{}'::text[],
  created_at timestamp with time zone not null default now()
);

revoke all on table private.exercise_muscle_taxonomy
  from PUBLIC, anon, authenticated, service_role;

-- The lower inventory is the 40 side-neutral actuator names from the official
-- RajagopalLaiUhlrich2023 model (the .osim contains left/right copies). The
-- upper inventory is the 50 compartments from the Stanford VA upper-extremity
-- model. The final 14 rows are explicitly non-OpenSim BodyParts3D extensions
-- for broad strength-training groups absent from those two reference models.
insert into private.exercise_muscle_taxonomy (
  key, label, broad_muscle, region, opensim_model, opensim_actuators
)
select
  source.key,
  pg_catalog.initcap(pg_catalog.replace(source.key, '_', ' ')),
  source.broad_muscle,
  source.region,
  source.opensim_model,
  case when source.actuator is null then '{}'::text[] else array[source.actuator] end
from (values
  ('adductor_brevis', 'adductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'addbrev'),
  ('adductor_longus', 'adductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'addlong'),
  ('adductor_magnus_distal', 'adductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'addmagDist'),
  ('adductor_magnus_ischial', 'adductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'addmagIsch'),
  ('adductor_magnus_middle', 'adductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'addmagMid'),
  ('adductor_magnus_proximal', 'adductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'addmagProx'),
  ('biceps_femoris_long_head', 'hamstrings', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'bflh'),
  ('biceps_femoris_short_head', 'hamstrings', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'bfsh'),
  ('extensor_digitorum_longus', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'edl'),
  ('extensor_hallucis_longus', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'ehl'),
  ('flexor_digitorum_longus', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'fdl'),
  ('flexor_hallucis_longus', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'fhl'),
  ('gastrocnemius_lateral_head', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'gaslat'),
  ('gastrocnemius_medial_head', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'gasmed'),
  ('gluteus_maximus_compartment_1', 'glutes', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmax1'),
  ('gluteus_maximus_compartment_2', 'glutes', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmax2'),
  ('gluteus_maximus_compartment_3', 'glutes', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmax3'),
  ('gluteus_medius_compartment_1', 'abductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmed1'),
  ('gluteus_medius_compartment_2', 'abductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmed2'),
  ('gluteus_medius_compartment_3', 'abductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmed3'),
  ('gluteus_minimus_compartment_1', 'abductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmin1'),
  ('gluteus_minimus_compartment_2', 'abductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmin2'),
  ('gluteus_minimus_compartment_3', 'abductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'glmin3'),
  ('gracilis', 'adductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'grac'),
  ('iliacus', 'quadriceps', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'iliacus'),
  ('fibularis_brevis', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'perbrev'),
  ('fibularis_longus', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'perlong'),
  ('piriformis', 'abductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'piri'),
  ('psoas_major', 'quadriceps', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'psoas'),
  ('rectus_femoris', 'quadriceps', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'recfem'),
  ('sartorius', 'quadriceps', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'sart'),
  ('semimembranosus', 'hamstrings', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'semimem'),
  ('semitendinosus', 'hamstrings', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'semiten'),
  ('soleus', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'soleus'),
  ('tensor_fasciae_latae', 'abductors', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'tfl'),
  ('tibialis_anterior', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'tibant'),
  ('tibialis_posterior', 'calves', 'lower-leg-foot', 'RajagopalLaiUhlrich2023', 'tibpost'),
  ('vastus_intermedius', 'quadriceps', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'vasint'),
  ('vastus_lateralis', 'quadriceps', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'vaslat'),
  ('vastus_medialis', 'quadriceps', 'hip-thigh', 'RajagopalLaiUhlrich2023', 'vasmed'),

  ('deltoid_anterior', 'shoulders', 'upper-arm', 'StanfordVAUpperExtremity', 'DELT1'),
  ('deltoid_middle', 'shoulders', 'upper-arm', 'StanfordVAUpperExtremity', 'DELT2'),
  ('deltoid_posterior', 'shoulders', 'upper-arm', 'StanfordVAUpperExtremity', 'DELT3'),
  ('supraspinatus', 'shoulders', 'upper-arm', 'StanfordVAUpperExtremity', 'SUPRA'),
  ('infraspinatus', 'shoulders', 'upper-arm', 'StanfordVAUpperExtremity', 'INFRA'),
  ('subscapularis', 'shoulders', 'upper-arm', 'StanfordVAUpperExtremity', 'SUBSCAP'),
  ('teres_minor', 'shoulders', 'upper-arm', 'StanfordVAUpperExtremity', 'TMIN'),
  ('teres_major', 'lats', 'upper-arm', 'StanfordVAUpperExtremity', 'TMAJ'),
  ('pectoralis_major_clavicular', 'chest', 'torso', 'StanfordVAUpperExtremity', 'PMAJ1'),
  ('pectoralis_major_sternal', 'chest', 'torso', 'StanfordVAUpperExtremity', 'PMAJ2'),
  ('pectoralis_major_ribs', 'chest', 'torso', 'StanfordVAUpperExtremity', 'PMAJ3'),
  ('latissimus_dorsi_thoracic', 'lats', 'torso', 'StanfordVAUpperExtremity', 'LAT1'),
  ('latissimus_dorsi_lumbar', 'lats', 'torso', 'StanfordVAUpperExtremity', 'LAT2'),
  ('latissimus_dorsi_iliac', 'lats', 'torso', 'StanfordVAUpperExtremity', 'LAT3'),
  ('coracobrachialis', 'biceps', 'upper-arm', 'StanfordVAUpperExtremity', 'CORB'),
  ('triceps_brachii_long_head', 'triceps', 'upper-arm', 'StanfordVAUpperExtremity', 'TRIlong'),
  ('triceps_brachii_lateral_head', 'triceps', 'upper-arm', 'StanfordVAUpperExtremity', 'TRIlat'),
  ('triceps_brachii_medial_head', 'triceps', 'upper-arm', 'StanfordVAUpperExtremity', 'TRImed'),
  ('anconeus', 'triceps', 'upper-arm', 'StanfordVAUpperExtremity', 'ANC'),
  ('supinator', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'SUP'),
  ('biceps_brachii_long_head', 'biceps', 'upper-arm', 'StanfordVAUpperExtremity', 'BIClong'),
  ('biceps_brachii_short_head', 'biceps', 'upper-arm', 'StanfordVAUpperExtremity', 'BICshort'),
  ('brachialis', 'biceps', 'upper-arm', 'StanfordVAUpperExtremity', 'BRA'),
  ('brachioradialis', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'BRD'),
  ('extensor_carpi_radialis_longus', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'ECRL'),
  ('extensor_carpi_radialis_brevis', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'ECRB'),
  ('extensor_carpi_ulnaris', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'ECU'),
  ('flexor_carpi_radialis', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FCR'),
  ('flexor_carpi_ulnaris', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FCU'),
  ('palmaris_longus', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'PL'),
  ('pronator_teres', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'PT'),
  ('pronator_quadratus', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'PQ'),
  ('flexor_digitorum_superficialis_digit_5', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FDSL'),
  ('flexor_digitorum_superficialis_digit_4', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FDSR'),
  ('flexor_digitorum_superficialis_digit_3', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FDSM'),
  ('flexor_digitorum_superficialis_digit_2', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FDSI'),
  ('flexor_digitorum_profundus_digit_5', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FDPL'),
  ('flexor_digitorum_profundus_digit_4', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FDPR'),
  ('flexor_digitorum_profundus_digit_3', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FDPM'),
  ('flexor_digitorum_profundus_digit_2', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FDPI'),
  ('extensor_digitorum_communis_digit_5', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'EDCL'),
  ('extensor_digitorum_communis_digit_4', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'EDCR'),
  ('extensor_digitorum_communis_digit_3', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'EDCM'),
  ('extensor_digitorum_communis_digit_2', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'EDCI'),
  ('extensor_digiti_minimi', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'EDM'),
  ('extensor_indicis_proprius', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'EIP'),
  ('extensor_pollicis_longus', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'EPL'),
  ('extensor_pollicis_brevis', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'EPB'),
  ('flexor_pollicis_longus', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'FPL'),
  ('abductor_pollicis_longus', 'forearms', 'forearm-hand', 'StanfordVAUpperExtremity', 'APL'),

  ('sternocleidomastoid', 'neck', 'head-neck', null, null),
  ('splenius_capitis', 'neck', 'head-neck', null, null),
  ('trapezius_upper', 'traps', 'torso', null, null),
  ('trapezius_middle', 'traps', 'torso', null, null),
  ('trapezius_lower', 'traps', 'torso', null, null),
  ('rhomboid_major', 'middle back', 'torso', null, null),
  ('rhomboid_minor', 'middle back', 'torso', null, null),
  ('iliocostalis_lumborum', 'lower back', 'torso', null, null),
  ('longissimus_thoracis', 'lower back', 'torso', null, null),
  ('spinalis_thoracis', 'lower back', 'torso', null, null),
  ('rectus_abdominis', 'abdominals', 'torso', null, null),
  ('external_oblique', 'abdominals', 'torso', null, null),
  ('internal_oblique', 'abdominals', 'torso', null, null),
  ('transversus_abdominis', 'abdominals', 'torso', null, null)
) as source(key, broad_muscle, region, opensim_model, actuator)
on conflict (key) do update set
  label = excluded.label,
  broad_muscle = excluded.broad_muscle,
  region = excluded.region,
  opensim_model = excluded.opensim_model,
  opensim_actuators = excluded.opensim_actuators;

alter table public.exercises
  add column if not exists muscles_detailed text[],
  add column if not exists muscles_secondary_detailed text[];

create or replace function private.canonical_broad_muscle(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_value, '')), '\s+', ' ', 'g'))
    when 'core' then 'abdominals'
    when 'abs' then 'abdominals'
    when 'pecs' then 'chest'
    when 'quads' then 'quadriceps'
    when 'delts' then 'shoulders'
    when 'rear delts' then 'shoulders'
    when 'upper back' then 'middle back'
    when 'erector spinae' then 'lower back'
    else pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_value, '')), '\s+', ' ', 'g'))
  end;
$function$;

revoke all on function private.canonical_broad_muscle(text)
  from PUBLIC, anon, authenticated, service_role;

create or replace function private.derive_detailed_muscles(
  p_name text,
  p_broad_muscles text[]
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_name text := pg_catalog.lower(coalesce(p_name, ''));
  v_broad text;
  v_result text[] := '{}'::text[];
begin
  foreach v_broad in array coalesce(p_broad_muscles, '{}'::text[]) loop
    v_broad := private.canonical_broad_muscle(v_broad);
    v_result := v_result || case v_broad
      when 'chest' then case
        when v_name ~ '(incline|upper chest)' then array['pectoralis_major_clavicular']
        when v_name ~ '(decline|dip|lower chest)' then array['pectoralis_major_sternal', 'pectoralis_major_ribs']
        else array['pectoralis_major_clavicular', 'pectoralis_major_sternal']
      end
      when 'lats' then array['latissimus_dorsi_thoracic', 'latissimus_dorsi_lumbar', 'latissimus_dorsi_iliac', 'teres_major']
      when 'middle back' then array['rhomboid_major', 'rhomboid_minor']
      when 'lower back' then array['iliocostalis_lumborum', 'longissimus_thoracis', 'spinalis_thoracis']
      when 'traps' then case
        when v_name ~ '(shrug|upper trap)' then array['trapezius_upper']
        when v_name ~ '(face pull|reverse|rear)' then array['trapezius_middle', 'trapezius_lower']
        else array['trapezius_upper', 'trapezius_middle', 'trapezius_lower']
      end
      when 'shoulders' then case
        when v_name ~ '(lateral|side raise)' then array['deltoid_middle', 'supraspinatus']
        when v_name ~ '(rear|reverse|face pull)' then array['deltoid_posterior', 'infraspinatus', 'teres_minor']
        when v_name ~ '(front raise)' then array['deltoid_anterior']
        when v_name ~ '(external rotation)' then array['infraspinatus', 'teres_minor']
        when v_name ~ '(internal rotation)' then array['subscapularis']
        when v_name ~ '(press|overhead)' then array['deltoid_anterior', 'deltoid_middle', 'supraspinatus']
        else array['deltoid_anterior', 'deltoid_middle', 'deltoid_posterior']
      end
      when 'neck' then array['sternocleidomastoid', 'splenius_capitis']
      when 'biceps' then case
        when v_name ~ '(hammer|neutral grip)' then array['brachialis']
        when v_name ~ '(incline|drag curl)' then array['biceps_brachii_long_head', 'brachialis']
        when v_name ~ '(preacher|spider|concentration)' then array['biceps_brachii_short_head', 'brachialis']
        else array['biceps_brachii_long_head', 'biceps_brachii_short_head', 'brachialis']
      end
      when 'triceps' then case
        when v_name ~ '(overhead|skull|lying extension)' then array['triceps_brachii_long_head']
        when v_name ~ '(pushdown|pressdown)' then array['triceps_brachii_lateral_head', 'triceps_brachii_medial_head']
        else array['triceps_brachii_long_head', 'triceps_brachii_lateral_head', 'triceps_brachii_medial_head']
      end
      when 'forearms' then case
        when v_name ~ '(reverse wrist|wrist extension)' then array['extensor_carpi_radialis_longus', 'extensor_carpi_radialis_brevis', 'extensor_carpi_ulnaris']
        when v_name ~ '(wrist curl|wrist flex)' then array['flexor_carpi_radialis', 'flexor_carpi_ulnaris', 'palmaris_longus']
        when v_name ~ '(pronat)' then array['pronator_teres', 'pronator_quadratus']
        when v_name ~ '(supinat)' then array['supinator']
        else array['brachioradialis', 'flexor_carpi_radialis', 'flexor_carpi_ulnaris', 'extensor_carpi_radialis_longus', 'extensor_carpi_ulnaris']
      end
      when 'abdominals' then case
        when v_name ~ '(side|twist|rotation|oblique|wood)' then array['external_oblique', 'internal_oblique', 'transversus_abdominis']
        else array['rectus_abdominis', 'transversus_abdominis']
      end
      when 'quadriceps' then case
        when v_name ~ '(hip flex|leg raise|knee raise)' then array['iliacus', 'psoas_major', 'rectus_femoris']
        else array['rectus_femoris', 'vastus_lateralis', 'vastus_medialis', 'vastus_intermedius']
      end
      when 'hamstrings' then array['biceps_femoris_long_head', 'biceps_femoris_short_head', 'semimembranosus', 'semitendinosus']
      when 'glutes' then array['gluteus_maximus_compartment_1', 'gluteus_maximus_compartment_2', 'gluteus_maximus_compartment_3']
      when 'calves' then case
        when v_name ~ '(tibialis|toe raise)' then array['tibialis_anterior']
        when v_name ~ '(seated)' then array['soleus']
        else array['gastrocnemius_medial_head', 'gastrocnemius_lateral_head', 'soleus']
      end
      when 'abductors' then array['gluteus_medius_compartment_1', 'gluteus_medius_compartment_2', 'gluteus_medius_compartment_3', 'gluteus_minimus_compartment_1', 'tensor_fasciae_latae']
      when 'adductors' then array['adductor_brevis', 'adductor_longus', 'adductor_magnus_proximal', 'adductor_magnus_middle', 'adductor_magnus_distal', 'gracilis']
      else '{}'::text[]
    end;
  end loop;

  return coalesce((
    select pg_catalog.array_agg(deduplicated.value order by deduplicated.first_position)
    from (
      select value, min(position) as first_position
      from unnest(v_result) with ordinality as item(value, position)
      group by value
    ) as deduplicated
  ), '{}'::text[]);
end;
$function$;

revoke all on function private.derive_detailed_muscles(text, text[])
  from PUBLIC, anon, authenticated, service_role;

update public.exercises as exercise
set
  muscles_detailed = private.derive_detailed_muscles(exercise.name, exercise.muscles),
  muscles_secondary_detailed = private.derive_detailed_muscles(exercise.name, exercise.muscles_secondary)
where exercise.muscles_detailed is null
   or exercise.muscles_secondary_detailed is null;

alter table public.exercises
  alter column muscles_detailed set default '{}'::text[],
  alter column muscles_detailed set not null,
  alter column muscles_secondary_detailed set default '{}'::text[],
  alter column muscles_secondary_detailed set not null;

create or replace function private.detailed_muscles_match_broad(
  p_detailed text[],
  p_broad text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    cardinality(coalesce(p_detailed, '{}'::text[])) <= 50
    and cardinality(coalesce(p_detailed, '{}'::text[])) = (
      select count(distinct value) from unnest(coalesce(p_detailed, '{}'::text[])) as item(value)
    )
    and not exists (
      select 1
      from unnest(coalesce(p_detailed, '{}'::text[])) as item(value)
      where not exists (
        select 1
        from private.exercise_muscle_taxonomy as taxonomy
        where taxonomy.key = item.value
          and exists (
            select 1
            from unnest(coalesce(p_broad, '{}'::text[])) as broad(value)
            where taxonomy.broad_muscle = private.canonical_broad_muscle(broad.value)
          )
      )
    );
$function$;

revoke all on function private.detailed_muscles_match_broad(text[], text[])
  from PUBLIC, anon, authenticated, service_role;
grant execute on function private.detailed_muscles_match_broad(text[], text[])
  to service_role;

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.exercises'::regclass
      and conname = 'exercises_detailed_muscles_match_broad'
  ) then
    alter table public.exercises
      add constraint exercises_detailed_muscles_match_broad
      check (
        private.detailed_muscles_match_broad(muscles_detailed, muscles)
        and private.detailed_muscles_match_broad(muscles_secondary_detailed, muscles_secondary)
      ) not valid;
  end if;
end;
$constraints$;

alter table public.exercises validate constraint exercises_detailed_muscles_match_broad;

create or replace function private.exercises_fill_detailed_muscles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.muscles_detailed := private.derive_detailed_muscles(new.name, new.muscles);
  new.muscles_secondary_detailed := private.derive_detailed_muscles(new.name, new.muscles_secondary);
  return new;
end;
$function$;

revoke all on function private.exercises_fill_detailed_muscles()
  from PUBLIC, anon, authenticated, service_role;

drop trigger if exists exercises_fill_detailed_muscles on public.exercises;
create trigger exercises_fill_detailed_muscles
before insert or update of name, muscles, muscles_secondary on public.exercises
for each row execute function private.exercises_fill_detailed_muscles();

create or replace function public.list_available_exercises_v3()
returns table (
  id bigint,
  name text,
  category text,
  equipment text,
  muscles text[],
  muscles_secondary text[],
  muscles_detailed text[],
  muscles_secondary_detailed text[],
  creator_id uuid,
  visibility text,
  video_url text
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
    exercise.id,
    exercise.name,
    exercise.category,
    exercise.equipment,
    exercise.muscles,
    exercise.muscles_secondary,
    exercise.muscles_detailed,
    exercise.muscles_secondary_detailed,
    exercise.creator_id,
    exercise.visibility,
    exercise.video_url
  from public.exercises as exercise
  where exercise.archived_at is null
    and (
      exercise.visibility = 'platform'
      or exercise.visibility = 'public'
      or exercise.creator_id = v_actor
      or (
        exercise.visibility = 'clients'
        and exercise.creator_id is not null
        and exists (
          select 1
          from public.trainer_relationships as relationship
          where relationship.trainer_id = exercise.creator_id
            and relationship.trainee_id = v_actor
            and relationship.status = 'active'
        )
      )
    )
  order by pg_catalog.lower(exercise.name), exercise.id;
end;
$function$;

create or replace function public.save_trainer_exercise_v2(
  p_exercise_id bigint,
  p_name text,
  p_category text,
  p_equipment text,
  p_muscles text[],
  p_muscles_secondary text[],
  p_muscles_detailed text[],
  p_muscles_secondary_detailed text[],
  p_instructions text[],
  p_video_url text,
  p_visibility text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_exercise_id bigint;
  v_primary text[];
  v_secondary text[];
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select coalesce(pg_catalog.array_agg(value order by first_position), '{}'::text[])
  into v_primary
  from (
    select pg_catalog.lower(pg_catalog.btrim(item.value)) as value, min(item.position) as first_position
    from unnest(coalesce(p_muscles_detailed, '{}'::text[])) with ordinality as item(value, position)
    where nullif(pg_catalog.btrim(item.value), '') is not null
    group by pg_catalog.lower(pg_catalog.btrim(item.value))
  ) as normalized;

  select coalesce(pg_catalog.array_agg(value order by first_position), '{}'::text[])
  into v_secondary
  from (
    select pg_catalog.lower(pg_catalog.btrim(item.value)) as value, min(item.position) as first_position
    from unnest(coalesce(p_muscles_secondary_detailed, '{}'::text[])) with ordinality as item(value, position)
    where nullif(pg_catalog.btrim(item.value), '') is not null
    group by pg_catalog.lower(pg_catalog.btrim(item.value))
  ) as normalized;

  if cardinality(v_primary) = 0 then
    v_primary := private.derive_detailed_muscles(p_name, p_muscles);
  end if;
  if cardinality(v_secondary) = 0 then
    v_secondary := private.derive_detailed_muscles(p_name, p_muscles_secondary);
  end if;

  if not private.detailed_muscles_match_broad(v_primary, p_muscles)
     or not private.detailed_muscles_match_broad(v_secondary, p_muscles_secondary) then
    raise exception using errcode = '22023', message = 'detailed muscles must match the selected broad muscle groups';
  end if;

  v_exercise_id := public.save_trainer_exercise(
    p_exercise_id,
    p_name,
    p_category,
    p_equipment,
    p_muscles,
    p_muscles_secondary,
    p_instructions,
    p_video_url,
    p_visibility
  );

  update public.exercises as exercise
  set
    muscles_detailed = v_primary,
    muscles_secondary_detailed = v_secondary
  where exercise.id = v_exercise_id
    and exercise.creator_id = v_actor;

  if not found then
    raise exception using errcode = 'P0002', message = 'trainer exercise not found';
  end if;

  return v_exercise_id;
end;
$function$;

revoke all on function public.list_available_exercises_v3()
  from PUBLIC, anon, authenticated, service_role;
revoke all on function public.save_trainer_exercise_v2(
  bigint, text, text, text, text[], text[], text[], text[], text[], text, text
)
  from PUBLIC, anon, authenticated, service_role;
grant execute on function public.list_available_exercises_v3() to authenticated;
grant execute on function public.save_trainer_exercise_v2(
  bigint, text, text, text, text[], text[], text[], text[], text[], text, text
)
  to authenticated;

comment on column public.exercises.muscles_detailed is
  'OpenSim-grounded or explicitly extended anatomical refinements of muscles; broad muscles remain the compatibility contract.';
comment on column public.exercises.muscles_secondary_detailed is
  'Secondary anatomical refinements, weighted as secondary exposure by the planner.';

commit;

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'exercises'
      and column_name = 'muscles_detailed'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'exercises'
      and column_name = 'muscles_secondary_detailed'
  ) as detailed_exercise_columns_created,
  (select count(*) from private.exercise_muscle_taxonomy where opensim_model = 'RajagopalLaiUhlrich2023') = 40
    as complete_opensim_lower_inventory,
  (select count(*) from private.exercise_muscle_taxonomy where opensim_model = 'StanfordVAUpperExtremity') = 50
    as complete_opensim_upper_inventory,
  not exists (
    select 1
    from public.exercises as exercise
    where (
      cardinality(coalesce(exercise.muscles, '{}'::text[])) > 0
      and cardinality(exercise.muscles_detailed) = 0
    ) or (
      cardinality(coalesce(exercise.muscles_secondary, '{}'::text[])) > 0
      and cardinality(exercise.muscles_secondary_detailed) = 0
    )
  ) as detailed_muscle_coverage_complete,
  not has_table_privilege('authenticated', 'private.exercise_muscle_taxonomy', 'select')
    and not has_table_privilege('anon', 'private.exercise_muscle_taxonomy', 'select')
    as taxonomy_base_access_denied,
  has_function_privilege('authenticated', 'public.list_available_exercises_v3()', 'execute')
    and has_function_privilege(
      'authenticated',
      'public.save_trainer_exercise_v2(bigint,text,text,text,text[],text[],text[],text[],text[],text,text)',
      'execute'
    )
    and not has_function_privilege('anon', 'public.list_available_exercises_v3()', 'execute')
    and not has_function_privilege('service_role', 'public.list_available_exercises_v3()', 'execute')
    as detailed_muscle_rpc_permissions_scoped,
  exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.exercises'::regclass
      and conname = 'exercises_detailed_muscles_match_broad'
      and convalidated
  ) as detailed_muscle_constraint_validated,
  (select count(*) from public.exercises) as stored_exercise_count,
  (select count(*) from public.workouts) as stored_workout_count,
  (select count(*) from public.sets) as stored_set_count;
