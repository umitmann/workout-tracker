# Musculoskeletal visual-model rationale

## What the reference systems actually model

OpenSim is a biomechanical simulation system, not a ready-to-ship surface atlas. Its muscle editor defines a geometry path as a muscle's line of action. A path can contain fixed, moving, and conditional via points; when it must bend around another structure, tangent points are computed against simplified sphere, ellipsoid, cylinder, or torus wrapping objects. See the official [OpenSim Muscle Editor](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53090145/Muscle%2BEditor) and [introductory modeling tutorial](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53088700/Tutorial%2B1%2B-%2BIntro%2Bto%2BMusculoskeletal%2BModeling).

OpenSim also avoids treating every named muscle as one line or lump. Its lower-limb reference model uses multiple muscle-tendon paths for broad attachments, turning 35 muscles into 44 compartments, and uses wrapping/via points to constrain paths around bones and deeper tissue. See the official [Lower Limb Model 2010 notes](https://opensimconfluence.atlassian.net/wiki/spaces/OpenSim/pages/53087777).

Surface shape is a separate problem. MRI-based reconstruction research describes muscles with substantially different architectures—including curved and fanned deltoids, fan-shaped adductor magnus, and bipennate rectus femoris—so one rescaled capsule cannot represent all of them faithfully. See [Skeletal Muscle Fascicle Arrangements Can Be Reconstructed Using a Laplacian Vector Field Simulation](https://pmc.ncbi.nlm.nih.gov/articles/PMC3808403/).

## Implemented hybrid

The renderer combines those two concerns:

- 90 real, segmented surface meshes provide recognizable macro-anatomy. They come from [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/), whose current archive license is [CC BY 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html).
- Individual heads and broad compartments stay separate. They share a workout-category color but remain distinct geometry for hit testing and future explanation.
- An original path model supplies missing atlas regions and the load-failure fallback. It has origin/insertion paths, curved via points, architecture labels, elliptical depth, and tapered ends.
- A neutral skeletal scaffold replaces the old outer-body capsules so the scene communicates attachments and proportions without pretending to be a biomechanical solver.
- Exercise filtering, set-equivalent calculation, planner state, and the classic/mobile editor are unchanged.

This is an inference-driven planning visualization, not an OpenSim simulation: it does not solve joint kinematics, moment arms, muscle force, tendon compliance, or wrapping under motion.

## Asset and performance decisions

The official full BodyParts3D download is 136 MB compressed. Shipping it directly would be unacceptable. The build selects only the mapped muscle parts, simplifies each while preserving named nodes, quantizes attributes, and applies meshopt compression. The delivered GLB is about 1.7 MB and is loaded only after the user opens the desktop 3D generator. Its content-hashed filename receives a one-year immutable cache header.

BodyParts3D itself warns that some structures were artist-created or adapted and that the dataset may contain anatomical errors. The UI therefore identifies the view as a planning model and keeps the existing non-medical disclaimer.
