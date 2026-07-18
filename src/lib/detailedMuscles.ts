export type OpenSimReferenceModel =
  | 'RajagopalLaiUhlrich2023'
  | 'StanfordVAUpperExtremity'

export type DetailedMuscle = {
  key: string
  label: string
  broadMuscle: string
  region: 'head-neck' | 'torso' | 'upper-arm' | 'forearm-hand' | 'hip-thigh' | 'lower-leg-foot'
  opensimModel: OpenSimReferenceModel | null
  opensimActuators: readonly string[]
}

type DetailTuple = readonly [
  key: string,
  label: string,
  broadMuscle: string,
  DetailedMuscle['region'],
  actuator: string,
]

const lower = ([key, label, broadMuscle, region, actuator]: DetailTuple): DetailedMuscle => ({
  key,
  label,
  broadMuscle,
  region,
  opensimModel: 'RajagopalLaiUhlrich2023',
  opensimActuators: [actuator],
})

const upper = ([key, label, broadMuscle, region, actuator]: DetailTuple): DetailedMuscle => ({
  key,
  label,
  broadMuscle,
  region,
  opensimModel: 'StanfordVAUpperExtremity',
  opensimActuators: [actuator],
})

const extension = (
  key: string,
  label: string,
  broadMuscle: string,
  region: DetailedMuscle['region'],
): DetailedMuscle => ({ key, label, broadMuscle, region, opensimModel: null, opensimActuators: [] })

// Side-neutral identifiers extracted from the official OpenSim model. The
// deployed .osim file contains a left and right copy of each entry.
export const OPENSIM_LOWER_ACTUATORS = [
  'addbrev', 'addlong', 'addmagDist', 'addmagIsch', 'addmagMid', 'addmagProx',
  'bflh', 'bfsh', 'edl', 'ehl', 'fdl', 'fhl', 'gaslat', 'gasmed',
  'glmax1', 'glmax2', 'glmax3', 'glmed1', 'glmed2', 'glmed3',
  'glmin1', 'glmin2', 'glmin3', 'grac', 'iliacus', 'perbrev', 'perlong',
  'piri', 'psoas', 'recfem', 'sart', 'semimem', 'semiten', 'soleus', 'tfl',
  'tibant', 'tibpost', 'vasint', 'vaslat', 'vasmed',
] as const

// The 50 compartments documented for the Stanford VA upper-extremity model.
export const OPENSIM_UPPER_ACTUATORS = [
  'DELT1', 'DELT2', 'DELT3', 'SUPRA', 'INFRA', 'SUBSCAP', 'TMIN', 'TMAJ',
  'PMAJ1', 'PMAJ2', 'PMAJ3', 'LAT1', 'LAT2', 'LAT3', 'CORB',
  'TRIlong', 'TRIlat', 'TRImed', 'ANC', 'SUP', 'BIClong', 'BICshort', 'BRA', 'BRD',
  'ECRL', 'ECRB', 'ECU', 'FCR', 'FCU', 'PL', 'PT', 'PQ',
  'FDSL', 'FDSR', 'FDSM', 'FDSI', 'FDPL', 'FDPR', 'FDPM', 'FDPI',
  'EDCL', 'EDCR', 'EDCM', 'EDCI', 'EDM', 'EIP', 'EPL', 'EPB', 'FPL', 'APL',
] as const

const OPEN_SIM_LOWER: readonly DetailedMuscle[] = [
  lower(['adductor_brevis', 'Adductor brevis', 'adductors', 'hip-thigh', 'addbrev']),
  lower(['adductor_longus', 'Adductor longus', 'adductors', 'hip-thigh', 'addlong']),
  lower(['adductor_magnus_distal', 'Adductor magnus — distal', 'adductors', 'hip-thigh', 'addmagDist']),
  lower(['adductor_magnus_ischial', 'Adductor magnus — ischial', 'adductors', 'hip-thigh', 'addmagIsch']),
  lower(['adductor_magnus_middle', 'Adductor magnus — middle', 'adductors', 'hip-thigh', 'addmagMid']),
  lower(['adductor_magnus_proximal', 'Adductor magnus — proximal', 'adductors', 'hip-thigh', 'addmagProx']),
  lower(['biceps_femoris_long_head', 'Biceps femoris — long head', 'hamstrings', 'hip-thigh', 'bflh']),
  lower(['biceps_femoris_short_head', 'Biceps femoris — short head', 'hamstrings', 'hip-thigh', 'bfsh']),
  lower(['extensor_digitorum_longus', 'Extensor digitorum longus', 'calves', 'lower-leg-foot', 'edl']),
  lower(['extensor_hallucis_longus', 'Extensor hallucis longus', 'calves', 'lower-leg-foot', 'ehl']),
  lower(['flexor_digitorum_longus', 'Flexor digitorum longus', 'calves', 'lower-leg-foot', 'fdl']),
  lower(['flexor_hallucis_longus', 'Flexor hallucis longus', 'calves', 'lower-leg-foot', 'fhl']),
  lower(['gastrocnemius_lateral_head', 'Gastrocnemius — lateral head', 'calves', 'lower-leg-foot', 'gaslat']),
  lower(['gastrocnemius_medial_head', 'Gastrocnemius — medial head', 'calves', 'lower-leg-foot', 'gasmed']),
  lower(['gluteus_maximus_compartment_1', 'Gluteus maximus — compartment 1', 'glutes', 'hip-thigh', 'glmax1']),
  lower(['gluteus_maximus_compartment_2', 'Gluteus maximus — compartment 2', 'glutes', 'hip-thigh', 'glmax2']),
  lower(['gluteus_maximus_compartment_3', 'Gluteus maximus — compartment 3', 'glutes', 'hip-thigh', 'glmax3']),
  lower(['gluteus_medius_compartment_1', 'Gluteus medius — compartment 1', 'abductors', 'hip-thigh', 'glmed1']),
  lower(['gluteus_medius_compartment_2', 'Gluteus medius — compartment 2', 'abductors', 'hip-thigh', 'glmed2']),
  lower(['gluteus_medius_compartment_3', 'Gluteus medius — compartment 3', 'abductors', 'hip-thigh', 'glmed3']),
  lower(['gluteus_minimus_compartment_1', 'Gluteus minimus — compartment 1', 'abductors', 'hip-thigh', 'glmin1']),
  lower(['gluteus_minimus_compartment_2', 'Gluteus minimus — compartment 2', 'abductors', 'hip-thigh', 'glmin2']),
  lower(['gluteus_minimus_compartment_3', 'Gluteus minimus — compartment 3', 'abductors', 'hip-thigh', 'glmin3']),
  lower(['gracilis', 'Gracilis', 'adductors', 'hip-thigh', 'grac']),
  lower(['iliacus', 'Iliacus', 'quadriceps', 'hip-thigh', 'iliacus']),
  lower(['fibularis_brevis', 'Fibularis brevis', 'calves', 'lower-leg-foot', 'perbrev']),
  lower(['fibularis_longus', 'Fibularis longus', 'calves', 'lower-leg-foot', 'perlong']),
  lower(['piriformis', 'Piriformis', 'abductors', 'hip-thigh', 'piri']),
  lower(['psoas_major', 'Psoas major', 'quadriceps', 'hip-thigh', 'psoas']),
  lower(['rectus_femoris', 'Rectus femoris', 'quadriceps', 'hip-thigh', 'recfem']),
  lower(['sartorius', 'Sartorius', 'quadriceps', 'hip-thigh', 'sart']),
  lower(['semimembranosus', 'Semimembranosus', 'hamstrings', 'hip-thigh', 'semimem']),
  lower(['semitendinosus', 'Semitendinosus', 'hamstrings', 'hip-thigh', 'semiten']),
  lower(['soleus', 'Soleus', 'calves', 'lower-leg-foot', 'soleus']),
  lower(['tensor_fasciae_latae', 'Tensor fasciae latae', 'abductors', 'hip-thigh', 'tfl']),
  lower(['tibialis_anterior', 'Tibialis anterior', 'calves', 'lower-leg-foot', 'tibant']),
  lower(['tibialis_posterior', 'Tibialis posterior', 'calves', 'lower-leg-foot', 'tibpost']),
  lower(['vastus_intermedius', 'Vastus intermedius', 'quadriceps', 'hip-thigh', 'vasint']),
  lower(['vastus_lateralis', 'Vastus lateralis', 'quadriceps', 'hip-thigh', 'vaslat']),
  lower(['vastus_medialis', 'Vastus medialis', 'quadriceps', 'hip-thigh', 'vasmed']),
]

const OPEN_SIM_UPPER: readonly DetailedMuscle[] = [
  upper(['deltoid_anterior', 'Deltoid — anterior', 'shoulders', 'upper-arm', 'DELT1']),
  upper(['deltoid_middle', 'Deltoid — middle', 'shoulders', 'upper-arm', 'DELT2']),
  upper(['deltoid_posterior', 'Deltoid — posterior', 'shoulders', 'upper-arm', 'DELT3']),
  upper(['supraspinatus', 'Supraspinatus', 'shoulders', 'upper-arm', 'SUPRA']),
  upper(['infraspinatus', 'Infraspinatus', 'shoulders', 'upper-arm', 'INFRA']),
  upper(['subscapularis', 'Subscapularis', 'shoulders', 'upper-arm', 'SUBSCAP']),
  upper(['teres_minor', 'Teres minor', 'shoulders', 'upper-arm', 'TMIN']),
  upper(['teres_major', 'Teres major', 'lats', 'upper-arm', 'TMAJ']),
  upper(['pectoralis_major_clavicular', 'Pectoralis major — clavicular', 'chest', 'torso', 'PMAJ1']),
  upper(['pectoralis_major_sternal', 'Pectoralis major — sternal', 'chest', 'torso', 'PMAJ2']),
  upper(['pectoralis_major_ribs', 'Pectoralis major — ribs', 'chest', 'torso', 'PMAJ3']),
  upper(['latissimus_dorsi_thoracic', 'Latissimus dorsi — thoracic', 'lats', 'torso', 'LAT1']),
  upper(['latissimus_dorsi_lumbar', 'Latissimus dorsi — lumbar', 'lats', 'torso', 'LAT2']),
  upper(['latissimus_dorsi_iliac', 'Latissimus dorsi — iliac', 'lats', 'torso', 'LAT3']),
  upper(['coracobrachialis', 'Coracobrachialis', 'biceps', 'upper-arm', 'CORB']),
  upper(['triceps_brachii_long_head', 'Triceps brachii — long head', 'triceps', 'upper-arm', 'TRIlong']),
  upper(['triceps_brachii_lateral_head', 'Triceps brachii — lateral head', 'triceps', 'upper-arm', 'TRIlat']),
  upper(['triceps_brachii_medial_head', 'Triceps brachii — medial head', 'triceps', 'upper-arm', 'TRImed']),
  upper(['anconeus', 'Anconeus', 'triceps', 'upper-arm', 'ANC']),
  upper(['supinator', 'Supinator', 'forearms', 'forearm-hand', 'SUP']),
  upper(['biceps_brachii_long_head', 'Biceps brachii — long head', 'biceps', 'upper-arm', 'BIClong']),
  upper(['biceps_brachii_short_head', 'Biceps brachii — short head', 'biceps', 'upper-arm', 'BICshort']),
  upper(['brachialis', 'Brachialis', 'biceps', 'upper-arm', 'BRA']),
  upper(['brachioradialis', 'Brachioradialis', 'forearms', 'forearm-hand', 'BRD']),
  upper(['extensor_carpi_radialis_longus', 'Extensor carpi radialis longus', 'forearms', 'forearm-hand', 'ECRL']),
  upper(['extensor_carpi_radialis_brevis', 'Extensor carpi radialis brevis', 'forearms', 'forearm-hand', 'ECRB']),
  upper(['extensor_carpi_ulnaris', 'Extensor carpi ulnaris', 'forearms', 'forearm-hand', 'ECU']),
  upper(['flexor_carpi_radialis', 'Flexor carpi radialis', 'forearms', 'forearm-hand', 'FCR']),
  upper(['flexor_carpi_ulnaris', 'Flexor carpi ulnaris', 'forearms', 'forearm-hand', 'FCU']),
  upper(['palmaris_longus', 'Palmaris longus', 'forearms', 'forearm-hand', 'PL']),
  upper(['pronator_teres', 'Pronator teres', 'forearms', 'forearm-hand', 'PT']),
  upper(['pronator_quadratus', 'Pronator quadratus', 'forearms', 'forearm-hand', 'PQ']),
  upper(['flexor_digitorum_superficialis_digit_5', 'Flexor digitorum superficialis — digit 5', 'forearms', 'forearm-hand', 'FDSL']),
  upper(['flexor_digitorum_superficialis_digit_4', 'Flexor digitorum superficialis — digit 4', 'forearms', 'forearm-hand', 'FDSR']),
  upper(['flexor_digitorum_superficialis_digit_3', 'Flexor digitorum superficialis — digit 3', 'forearms', 'forearm-hand', 'FDSM']),
  upper(['flexor_digitorum_superficialis_digit_2', 'Flexor digitorum superficialis — digit 2', 'forearms', 'forearm-hand', 'FDSI']),
  upper(['flexor_digitorum_profundus_digit_5', 'Flexor digitorum profundus — digit 5', 'forearms', 'forearm-hand', 'FDPL']),
  upper(['flexor_digitorum_profundus_digit_4', 'Flexor digitorum profundus — digit 4', 'forearms', 'forearm-hand', 'FDPR']),
  upper(['flexor_digitorum_profundus_digit_3', 'Flexor digitorum profundus — digit 3', 'forearms', 'forearm-hand', 'FDPM']),
  upper(['flexor_digitorum_profundus_digit_2', 'Flexor digitorum profundus — digit 2', 'forearms', 'forearm-hand', 'FDPI']),
  upper(['extensor_digitorum_communis_digit_5', 'Extensor digitorum communis — digit 5', 'forearms', 'forearm-hand', 'EDCL']),
  upper(['extensor_digitorum_communis_digit_4', 'Extensor digitorum communis — digit 4', 'forearms', 'forearm-hand', 'EDCR']),
  upper(['extensor_digitorum_communis_digit_3', 'Extensor digitorum communis — digit 3', 'forearms', 'forearm-hand', 'EDCM']),
  upper(['extensor_digitorum_communis_digit_2', 'Extensor digitorum communis — digit 2', 'forearms', 'forearm-hand', 'EDCI']),
  upper(['extensor_digiti_minimi', 'Extensor digiti minimi', 'forearms', 'forearm-hand', 'EDM']),
  upper(['extensor_indicis_proprius', 'Extensor indicis proprius', 'forearms', 'forearm-hand', 'EIP']),
  upper(['extensor_pollicis_longus', 'Extensor pollicis longus', 'forearms', 'forearm-hand', 'EPL']),
  upper(['extensor_pollicis_brevis', 'Extensor pollicis brevis', 'forearms', 'forearm-hand', 'EPB']),
  upper(['flexor_pollicis_longus', 'Flexor pollicis longus', 'forearms', 'forearm-hand', 'FPL']),
  upper(['abductor_pollicis_longus', 'Abductor pollicis longus', 'forearms', 'forearm-hand', 'APL']),
]

// The two OpenSim reference models intentionally omit several trunk, neck,
// and scapular groups used by a general strength-training catalog. These
// BodyParts3D-backed extensions ensure that every legacy broad group still has
// a truthful anatomical fallback without pretending it came from OpenSim.
const WORKOUT_COVERAGE_EXTENSIONS: readonly DetailedMuscle[] = [
  extension('sternocleidomastoid', 'Sternocleidomastoid', 'neck', 'head-neck'),
  extension('splenius_capitis', 'Splenius capitis', 'neck', 'head-neck'),
  extension('trapezius_upper', 'Trapezius — upper', 'traps', 'torso'),
  extension('trapezius_middle', 'Trapezius — middle', 'traps', 'torso'),
  extension('trapezius_lower', 'Trapezius — lower', 'traps', 'torso'),
  extension('rhomboid_major', 'Rhomboid major', 'middle back', 'torso'),
  extension('rhomboid_minor', 'Rhomboid minor', 'middle back', 'torso'),
  extension('iliocostalis_lumborum', 'Iliocostalis lumborum', 'lower back', 'torso'),
  extension('longissimus_thoracis', 'Longissimus thoracis', 'lower back', 'torso'),
  extension('spinalis_thoracis', 'Spinalis thoracis', 'lower back', 'torso'),
  extension('rectus_abdominis', 'Rectus abdominis', 'abdominals', 'torso'),
  extension('external_oblique', 'External oblique', 'abdominals', 'torso'),
  extension('internal_oblique', 'Internal oblique', 'abdominals', 'torso'),
  extension('transversus_abdominis', 'Transversus abdominis', 'abdominals', 'torso'),
]

export const DETAILED_MUSCLES: readonly DetailedMuscle[] = [
  ...OPEN_SIM_LOWER,
  ...OPEN_SIM_UPPER,
  ...WORKOUT_COVERAGE_EXTENSIONS,
]

const BROAD_MUSCLE_ALIASES: Readonly<Record<string, string>> = {
  core: 'abdominals',
  abs: 'abdominals',
  pecs: 'chest',
  quads: 'quadriceps',
  delts: 'shoulders',
  'rear delts': 'shoulders',
  'upper back': 'middle back',
  'erector spinae': 'lower back',
}

export function canonicalBroadMuscle(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  return BROAD_MUSCLE_ALIASES[normalized] ?? normalized
}

const DETAILED_BY_BROAD = new Map<string, readonly string[]>()
for (const muscle of DETAILED_MUSCLES) {
  const existing = DETAILED_BY_BROAD.get(muscle.broadMuscle) ?? []
  DETAILED_BY_BROAD.set(muscle.broadMuscle, [...existing, muscle.key])
}

export function detailedMuscleKeysForBroadMuscle(broadMuscle: string): readonly string[] {
  return DETAILED_BY_BROAD.get(canonicalBroadMuscle(broadMuscle)) ?? []
}
