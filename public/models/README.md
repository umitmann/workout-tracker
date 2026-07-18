# Musculoskeletal model asset

`bodyparts3d-muscles.b37dea4a.glb` contains 90 separately named muscle surfaces derived from BodyParts3D release 4.0. The runtime keeps each anatomical head or compartment selectable and maps it to the workout app's broader muscle categories.

Attribution: BodyParts3D, © The Database Center for Life Science. The [current archive license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) is CC BY 4.0. The release-4.0 OBJ headers also preserve their historical reference to CC BY-SA 2.1 Japan; this repository retains that notice and does not claim ownership of the source anatomy.

Source: <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/>

The source part IDs and their category mapping are in `src/lib/anatomyModel.ts`. To rebuild after downloading `isa_BP3D_4.0_obj_99.zip` from the official archive:

```sh
npx tsx scripts/build-muscle-anatomy-model.ts isa_BP3D_4.0_obj_99.zip unoptimized.glb
npx @gltf-transform/cli optimize unoptimized.glb optimized.glb --compress meshopt --flatten false --join false --instance false --palette false --simplify-ratio 0.35 --simplify-error 0.001
```

The optimized asset itself is offered under CC BY 4.0 under the archive's current license terms. Application code remains under the repository's own terms.
