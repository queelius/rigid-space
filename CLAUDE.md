# CLAUDE.md: Rigid Space

## Project Overview

Star Control 2-inspired space sandbox built on rigid body physics (Rapier2D WASM). Fork of space-engine-ts concepts with a rigid body foundation instead of spring networks. Ships, planets, stations, asteroids are grid-based composites rendered as textures, with rigid body collision and dynamics.

**Stack**: TypeScript, PixiJS v8, Rapier2D-compat (WASM), Vite, vitest

## Build & Run

```bash
npm install
npx vite                       # dev server (port 5173)
npx vite build                 # production build
npx vitest run                 # run tests
npx vitest bench               # run benchmarks
```

## Architecture

### From space-engine-ts (migrate these)

- **GridComposite / image-import**: Grid-based pixel editor for building composites. PNG import via hue-band mapping.
- **RigidComposite rendering**: Render-to-texture (OffscreenCanvas to Sprite). O(1) per object.
- **Star shader**: GLSL plasma shader with heat-dependent colors, limb darkening.
- **Galaxy / star systems**: System graph, procgen planets/stations/asteroids.
- **Stargates + hyperspace**: Gate network, flyable hyperspace with zones.
- **Screen state stack**: Layered UI (trade, dialog, builder, minimap, jump, hyperspace).
- **Builder UI**: Grid editor with palette, templates, custom sizes, paint mode.
- **MCP content generator**: AI art via OpenAI gpt-image-1, deploy to YAML config.
- **Trade / quests / NPC dialog**: Game systems.
- **Sound engine**: Event-based sound playback.
- **Config system**: YAML-driven (types, systems, gameplay, hyperspace, etc.).

### New in rigid-space

- **Rapier2D physics**: Rigid body dynamics, colliders, joints/constraints.
- **Custom gravity**: N-body via explicit force application (no Barnes-Hut needed for moderate body counts; Rapier handles collisions).
- **Compound rigid bodies**: Ship = multiple colliders on one rigid body. Grid cells map to colliders.
- **Joints for articulation**: Revolute/prismatic joints between composite sections.
- **Damage model**: Remove colliders from compound body on impact (cell destruction without spring breakage).

### Key difference from space-engine-ts

In space-engine-ts, composites are either:
- Soft-body spring networks (SpawnedComposite): each cell is a particle with bonds. Expensive.
- Virtual rigid bodies (RigidComposite): single rep particle, no real physics between cells.

In rigid-space, ALL composites are Rapier rigid bodies:
- Small composites: compound rigid body (one body, many colliders). Fast.
- Articulated structures: multiple bodies connected by joints. Moderate cost.
- No spring networks. No per-cell particle physics. No Barnes-Hut gravity tree.

## Migration Priority

1. **GridComposite + builder UI + image import** (core building system)
2. **Renderer** (PixiJS world container, rigid composite textures, star shader)
3. **Config system** (YAML loader, types, gameplay tunables)
4. **Galaxy + systems + procgen** (star systems, planets, stations)
5. **Stargates + hyperspace** (travel mechanics)
6. **MCP content generator** (AI art pipeline)
7. **Trade / quests / NPCs** (game systems)
8. **Sound** (event-based audio)

## Known Issues / Next Steps

- Proof of concept only: 1 star, 1 ship, 20 asteroids
- No builder yet (need to port GridComposite + builder UI)
- No composite rendering (just circles/boxes)
- Custom gravity is O(N^2) brute force (fine up to ~1000 bodies, optimize later)
- Audio not yet integrated (port from space-engine-ts or use Suno pipeline)
