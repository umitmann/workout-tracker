export type AnatomyModelMesh = {
  nodeName: string
  muscle: string
  side: 'left' | 'right'
  sourcePartId: string
  anatomicalName: string
}

const pair = (
  muscle: string,
  compartment: string,
  rightSourcePartId: string,
  leftSourcePartId: string,
): readonly AnatomyModelMesh[] => [
  {
    nodeName: `muscle__${muscle.replaceAll(' ', '_')}__right_${compartment}`,
    muscle,
    side: 'right',
    sourcePartId: rightSourcePartId,
    anatomicalName: `Right ${compartment.replaceAll('_', ' ')}`,
  },
  {
    nodeName: `muscle__${muscle.replaceAll(' ', '_')}__left_${compartment}`,
    muscle,
    side: 'left',
    sourcePartId: leftSourcePartId,
    anatomicalName: `Left ${compartment.replaceAll('_', ' ')}`,
  },
]

// Each entry points to one segmented BodyParts3D surface. Broad muscles and
// multi-headed muscles deliberately remain separate, mirroring the multiple
// lines-of-action convention used by OpenSim models.
export const ANATOMY_MODEL_MESHES: readonly AnatomyModelMesh[] = [
  ...pair('neck', 'sternocleidomastoid', 'FJ1595', 'FJ1573'),
  ...pair('neck', 'splenius_capitis', 'FJ1545', 'FJ1545M'),
  ...pair('traps', 'ascending_trapezius', 'FJ1520', 'FJ1520M'),
  ...pair('traps', 'transverse_trapezius', 'FJ1554', 'FJ1554M'),
  ...pair('traps', 'descending_trapezius', 'FJ1521', 'FJ1521M'),
  ...pair('shoulders', 'anterior_deltoid', 'FJ1468', 'FJ1468M'),
  ...pair('shoulders', 'lateral_deltoid', 'FJ1467', 'FJ1467M'),
  ...pair('shoulders', 'posterior_deltoid', 'FJ1513', 'FJ1513M'),
  ...pair('chest', 'clavicular_pectoralis_major', 'FJ1447', 'FJ1447M'),
  ...pair('chest', 'sternocostal_pectoralis_major', 'FJ1464', 'FJ1464M'),
  ...pair('chest', 'abdominal_pectoralis_major', 'FJ1446', 'FJ1446M'),
  ...pair('abdominals', 'external_oblique', 'FJ1452', 'FJ1452M'),
  ...pair('middle back', 'rhomboid_major', 'FJ1536', 'FJ1536M'),
  ...pair('middle back', 'rhomboid_minor', 'FJ1537', 'FJ1537M'),
  ...pair('lower back', 'iliocostalis_lumborum', 'FJ1527', 'FJ1527M'),
  ...pair('lower back', 'longissimus_thoracis', 'FJ1535', 'FJ1535M'),
  ...pair('lower back', 'spinalis_thoracis', 'FJ1544', 'FJ1544M'),
  ...pair('biceps', 'short_head_biceps_brachii', 'FJ1512', 'FJ1512M'),
  ...pair('biceps', 'long_head_biceps_brachii', 'FJ1478', 'FJ1478M'),
  ...pair('triceps', 'medial_head_triceps_brachii', 'FJ1480', 'FJ1480M'),
  ...pair('triceps', 'lateral_head_triceps_brachii', 'FJ1477', 'FJ1477M'),
  ...pair('triceps', 'long_head_triceps_brachii', 'FJ1479', 'FJ1479M'),
  ...pair('forearms', 'brachioradialis', 'FJ1487', 'FJ1487M'),
  ...pair('forearms', 'flexor_carpi_radialis', 'FJ1496', 'FJ1496M'),
  ...pair('forearms', 'extensor_carpi_radialis_longus', 'FJ1490', 'FJ1490M'),
  ...pair('forearms', 'flexor_carpi_ulnaris', 'FJ1473', 'FJ1473M'),
  ...pair('glutes', 'gluteus_maximus', 'FJ1418', 'FJ1418M'),
  ...pair('abductors', 'gluteus_medius', 'FJ1419', 'FJ1419M'),
  ...pair('abductors', 'gluteus_minimus', 'FJ1420', 'FJ1420M'),
  ...pair('abductors', 'tensor_fasciae_latae', 'FJ1438', 'FJ1438M'),
  ...pair('adductors', 'adductor_longus', 'FJ1402', 'FJ1402M'),
  ...pair('adductors', 'adductor_magnus', 'FJ1403', 'FJ1403M'),
  ...pair('adductors', 'adductor_brevis', 'FJ1401', 'FJ1401M'),
  ...pair('adductors', 'gracilis', 'FJ1421', 'FJ1421M'),
  ...pair('quadriceps', 'rectus_femoris', 'FJ1433', 'FJ1433M'),
  ...pair('quadriceps', 'vastus_lateralis', 'FJ1442', 'FJ1442M'),
  ...pair('quadriceps', 'vastus_medialis', 'FJ1443', 'FJ1443M'),
  ...pair('quadriceps', 'vastus_intermedius', 'FJ1441', 'FJ1441M'),
  ...pair('hamstrings', 'long_head_biceps_femoris', 'FJ1395', 'FJ1395M'),
  ...pair('hamstrings', 'short_head_biceps_femoris', 'FJ1444', 'FJ1444M'),
  ...pair('hamstrings', 'semitendinosus', 'FJ1436', 'FJ1436M'),
  ...pair('hamstrings', 'semimembranosus', 'FJ1435', 'FJ1435M'),
  ...pair('calves', 'medial_gastrocnemius', 'FJ1397', 'FJ1397M'),
  ...pair('calves', 'lateral_gastrocnemius', 'FJ1394', 'FJ1394M'),
  ...pair('calves', 'soleus', 'FJ1437', 'FJ1437M'),
]

export const ANATOMY_MODEL_URL = '/models/bodyparts3d-muscles.b37dea4a.glb'

export const ANATOMY_MODEL_ATTRIBUTION = {
  name: 'BodyParts3D',
  copyright: '© The Database Center for Life Science',
  license: 'CC BY 4.0',
  sourceUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/',
  licenseUrl: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
} as const

export function anatomyModelCoverage(): Set<string> {
  return new Set(ANATOMY_MODEL_MESHES.map((mesh) => mesh.muscle))
}
