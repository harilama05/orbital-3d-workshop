# Model sources and compatibility

The application contains five models with reviewed replacement parts. Models that only supported exploded views without replacement options are not part of this library.

| Model | Source | Replaceable slots | Options per slot |
| --- | --- | --- | --- |
| Cruiser 01 | [Modular Spaceships and Space Fleet](https://3dassets.dev/packs/interstellar-fleet-modular-starships) | Engine, weapon, sensor, utility bay | 3 / 4 / 3 / 3 |
| City Car / Ô tô City | [Kenney Car Kit 3.1](https://kenney.nl/assets/car-kit) | Four independent wheels | Native, standard, racing |
| Mech Line | [Mech Robots and Battle Hangar](https://3dassets.dev/packs/mech-hangar-and-battle-frames) | Chassis, left arm, right arm, head, back module | 3 / 4 / 4 / 3 / 4 |
| Carbine | [Mega Weapon Pack](https://3dassets.dev/packs/mega-weapon-pack) | Stock, magazine, optic, muzzle, underbarrel, side rail | 4 / 4 / 3 / 3 / 3 / 1 |
| Pistol | [Mega Weapon Pack](https://3dassets.dev/packs/mega-weapon-pack) | Magazine, optic, muzzle, underbarrel | 3 / 2 / 2 / 2 |

The source packs list CC0 1.0 licensing. Original Kenney license text is retained in `public/licenses/kenney-car-kit.txt`. The Carbine side rail has one accessory and supports installation/removal rather than multiple replacements. Fixed groups remain selectable and inspectable.

## Compatibility evidence

- **Cruiser:** placement starts from the source pack's cruiser starter scene. This project declares slot rules and adjusts attachment positions for each variant. The five separable groups are the hull and four attached modules; details merged into the hull are not individual mechanical parts.
- **Mech:** the Line torso uses the medium socket system with 0.5 m pads. Host sockets include left/right shoulders, hip, head and back; child parts expose mount, hip or neck interfaces. Light/heavy components are excluded from the medium compatibility lists.
- **Weapons:** the source descriptions identify optic rail, muzzle, magazine, underbarrel, side rail and stock interfaces. Rifle and pistol magazines are kept separate. Source socket positions and mounts are checked against the builder declarations.
- **Car:** the source GLB provides separate wheel nodes and axle transforms. Replacement wheels share the 0.6 source-unit diameter and are aligned by axle center and inner mounting face. Geometry is not stretched to force a fit. Color-only variants are excluded when their difference would disappear in particle mode.

`scripts/modular-evidence.json` records source URLs, author port descriptions, socket classes and Kenney wheel-node transforms. `scripts/modular-sources.ts` declares the reviewed subset. Unit tests compare these independent records, reject incompatible slots/models, and verify replacement, removal and configuration round trips.

## Geometry preparation

`scripts/fetch-modular.py` downloads only the required source subset into the ignored `.tools` cache. `scripts/prepare-modular.ts` reads interleaved/quantized positions, applies source transforms, and moves each part's origin to its mount before exporting GLB, particles, feature edges and SVG previews derived from the geometry.

Every option uses the slot's shared attachment point. A common model scale preserves proportions when swapping differently sized parts. The four additional models prepare up to 100,000 points each; Auto quality displays roughly 22,000 points for a complete default assembly. Only active geometry is loaded, and scenes are disposed when switching models. Kenney palette textures become flat surface colors; particle mode colors each assembly group separately.

Straight feature edges follow creases and boundaries rather than drawing coplanar triangle diagonals. Particle samples and edges are precomputed, so visitors do not perform this preparation when loading the website.

## Animation coverage

All eleven original weapon clips are retained:

- **Carbine:** stock-open/close, magazine-open/close, charge-open/close.
- **Pistol:** slide-open/close, magazine-open/close, cock. The optic inherits slide motion, including after a replacement.

The car source has no animation clips. The application adds wheel rotation around the actual wheel-node X axes; this is procedural motion, not an animation supplied by the pack. Mech and Cruiser have no source clips and remain static apart from user interaction and assembly transitions.

Particles, edges and picking meshes share animation transforms. Stable animation nodes preserve bindings when a part is replaced or removed. The UI supports clip selection, play/pause, play once, looping and restoring the bind pose. This is visual playback, without vehicle physics or collision simulation.

## Rebuild the assets

Generated deployment assets are included in Git. Ordinary development and Vercel builds only require `npm ci` and `npm run build`; the steps below are optional and require Python 3 plus network access.

Cruiser assets and particles:

```sh
python scripts/fetch-assets.py
npm run prepare:particles
```

Car, mech and weapon assets:

```sh
python scripts/fetch-modular.py
npm run prepare:modular
```

Commit the resulting files in `public/models`, `public/particles`, `public/animations` and `src/modular.generated.json` when changing the asset library. Keep `asset-manifest.json` and the source/evidence declarations for traceability. Asset generation caches stay outside Git.

Validate after regeneration:

```sh
npm test
npm run test:e2e
npm run build
```
