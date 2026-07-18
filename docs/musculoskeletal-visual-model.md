# Musculoskeletal visual-model rationale

## What the reference systems actually model

OpenSim is a biomechanical simulation system, not a ready-to-ship surface atlas. Its muscle editor defines a geometry path as a muscle's line of action. A path can contain fixed, moving, and conditional via points; when it must bend around another structure, tangent points are computed against simplified sphere, ellipsoid, cylinder, or torus wrapping objects. See the official [OpenSim Muscle Editor](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53090145/Muscle%2BEditor) and [introductory modeling tutorial](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53088700/Tutorial%2B1%2B-%2BIntro%2Bto%2BMusculoskeletal%2BModeling).

OpenSim also avoids treating every named muscle as one line or lump. The app's current lower-body reference is the official `RajagopalLaiUhlrich2023.osim` model distributed by the [OpenSim model repository](https://github.com/opensim-org/opensim-models/tree/master/Models/Rajagopal). It contains 40 side-neutral muscle compartments—80 actuators after left/right expansion. Its upper-body reference is the [Stanford VA Upper Extremity Model](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53087772/Upper%2BExtremity%2BModel), whose 50 compartments span the shoulder, elbow, forearm, wrist, thumb, and index finger.

Surface shape is a separate problem. MRI-based reconstruction research describes muscles with substantially different architectures—including curved and fanned deltoids, fan-shaped adductor magnus, and bipennate rectus femoris—so one rescaled capsule cannot represent all of them faithfully. See [Skeletal Muscle Fascicle Arrangements Can Be Reconstructed Using a Laplacian Vector Field Simulation](https://pmc.ncbi.nlm.nih.gov/articles/PMC3808403/).

## Implemented hybrid

The renderer combines those two concerns:

- 90 real, segmented surface meshes provide recognizable macro-anatomy. They come from [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/), whose current archive license is [CC BY 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html).
- Individual heads and broad compartments stay separate. They share a workout-category color but remain distinct geometry for hit testing and future explanation.
- Exercise metadata now preserves the established broad categories and adds primary/secondary detailed arrays. The private taxonomy records the source model and exact OpenSim actuator identifier for all 40 lower and 50 upper compartments. Fourteen BodyParts3D-backed neck/trunk extensions are explicitly marked as non-OpenSim instead of being attributed to a model that does not contain them.
- Name-aware backfill distinguishes common variants such as incline/decline pressing, front/lateral/rear shoulder work, hammer/incline/preacher curls, overhead versus pushdown triceps work, wrist flexion/extension, seated calves, and rotational core work. These are explainable planning classifications, not measured recruitment percentages.
- An original path model supplies missing atlas regions and the load-failure fallback. It has origin/insertion paths, curved via points, architecture labels, elliptical depth, and tapered ends.
- A neutral skeletal scaffold replaces the old outer-body capsules so the scene communicates attachments and proportions without pretending to be a biomechanical solver.
- Exercise filtering, set-equivalent calculation, planner state, and the classic/mobile editor are unchanged.

This is an inference-driven planning visualization, not an OpenSim simulation: it does not solve joint kinematics, moment arms, muscle force, tendon compliance, or wrapping under motion.

## Asset and performance decisions

The official full BodyParts3D download is 136 MB compressed. Shipping it directly would be unacceptable. The build selects only the mapped muscle parts, simplifies each while preserving named nodes, quantizes attributes, and applies meshopt compression. The delivered GLB is about 1.7 MB and is loaded only after the user opens the desktop 3D generator. Its content-hashed filename receives a one-year immutable cache header.

BodyParts3D itself warns that some structures were artist-created or adapted and that the dataset may contain anatomical errors. The UI therefore identifies the view as a planning model and keeps the existing non-medical disclaimer.
