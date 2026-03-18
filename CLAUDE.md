# CLAUDE.md: Rigid Space

## Project Overview

Star Control 2-inspired space sandbox built on rigid body physics (Rapier2D WASM). Fork of space-engine-ts concepts, replacing spring networks with Rapier rigid bodies. Ships, planets, stations, asteroids are grid-based composites where each cell becomes a collider on a compound rigid body.

**Stack**: TypeScript, PixiJS v8, Rapier2D-compat (WASM), Vite, vitest

**Origin**: Forked concepts from `~/github/beta/space-engine-ts` (soft-body engine). That project remains active for soft-body experimentation.

## Build & Run

```bash
npm install
npx vite                       # dev server (port 5173)
npx vite build                 # production build
npx vitest run                 # run tests
```

## Current State

**Working**: Rapier2D proof of concept in `src/main.ts`. Central star with custom gravity, flyable ship (WASD), 20 orbiting asteroids. All rigid body.

**Ported but not yet wired**: 44 files copied from space-engine-ts. These are physics-agnostic game layer code that needs to be connected to Rapier instead of the old particle/bond system:

- `src/engine/types.ts`: Type enum (ROCK, IRON, FUEL, DRIVECORE, etc.), 20 types
- `src/engine/grid-composite.ts`: Grid editor data structure (spawn method removed, physics-agnostic now)
- `src/engine/rigid-spawn.ts`: **NEW** - creates Rapier compound rigid bodies from GridComposite (one box collider per cell)
- `src/engine/image-import.ts`: PNG to GridComposite conversion
- `src/engine/gate-composite.ts`: Stargate ring grid generation
- `src/engine/events.ts`: EventBus for decoupled game events
- `src/game/builder.ts`: Grid editor (infinite inventory, custom sizes, paint mode)
- `src/game/screen-stack.ts`: Layered UI state management
- `src/game/states/*`: TradeMenu, NPCDialog, Builder, Minimap, JumpTransition
- `src/game/input.ts`: InputManager with configurable keybindings
- `src/game/trade.ts`, `quests.ts`, `npc.ts`, `sound.ts`: Game systems
- `src/game/stargate.ts`, `drivecore.ts`: Travel mechanics
- `src/config/loader.ts`: YAML config loader (types, systems, gameplay, hyperspace, etc.)
- `public/assets/config/*`: All YAML configs from space-engine-ts
- `public/assets/generated/*`: MCP-generated art (planets, stations, Ancient structures)

## What Needs to Happen Next

### Priority 1: Wire main.ts to use ported code

Replace the proof-of-concept main.ts with a proper game that uses:
- `GridComposite` + `spawnComposite()` for creating game objects
- `Builder` + `ScreenStack` for the editor UI
- `InputManager` for configurable keybindings
- The config loader for YAML-driven gameplay

### Priority 2: Port the renderer

The space-engine-ts renderer (`src/render/renderer.ts`, ~1500 lines) needs porting. Key pieces:
- PixiJS v8 world container with Y-flip (negative scale)
- Composite texture rendering (OffscreenCanvas baked to Sprite per composite)
- Star plasma shader (GLSL, heat-dependent colors, limb darkening)
- Black hole shader (lensing, accretion disk)
- HUD overlay (Canvas2D)
- Builder overlay (grid editor, palette, buttons)
- The renderer is large; consider splitting into focused modules during port

### Priority 3: Port galaxy/procgen

- `Galaxy` class manages star systems, connections, composite arrays
- `generateSystem()` creates stars, planets, stations, asteroids, stargates
- Needs adaptation: instead of `world.addParticle()` and `grid.spawn()`, use `spawnComposite()` from `rigid-spawn.ts`
- `enterSystem()` wrapper in main.ts handles renderer cleanup, physics wiring, ship spawn

### Priority 4: Port hyperspace

- `HyperspaceWorld` with zone-based drag (slipstream/transition/void)
- `HyperspaceFlightState` screen state
- Custom gravity via Rapier's `addForce()` instead of Barnes-Hut tree
- This actually simplifies: Rapier handles collisions natively, no grid needed

## Key Architecture Decisions

### Rapier Compound Bodies (rigid-spawn.ts)

Every GridComposite becomes ONE Rapier RigidBody with multiple colliders:
```typescript
const spawned = spawnComposite(world, grid, x, y, vx, vy, cellScale)
// spawned.body = Rapier.RigidBody
// spawned.colliderMap = Map<"gx,gy", Rapier.Collider>
// Can remove individual cell colliders for damage/mining
```

This replaces:
- space-engine-ts `SpawnedComposite` (particles + bonds): expensive, O(N) per cell
- space-engine-ts `RigidComposite` (single rep particle): cheap but no real collision
- Rapier compound body: cheap AND real collision per cell

### Custom Gravity

Rapier has no built-in gravity between arbitrary bodies. We apply it manually:
```typescript
body.addForce(new RAPIER.Vector2(fx, fy), true)
```
For N bodies this is O(N^2) brute force. Fine up to ~1000 bodies. If we need more, we can add Barnes-Hut later, but Rapier's collision handling saves us the expensive grid-based collision from space-engine-ts.

### No Spring Networks

The core design choice: no bonds, no spring forces, no per-cell particles. Composites are rigid. Damage = removing colliders from the compound body. If a composite should break apart, we split it into multiple Rapier bodies (future work).

## MCP Content Generator

The MCP server from space-engine-ts (`tools/space-engine-gen/`) generates PNGs via OpenAI gpt-image-1. These work identically here since `compositeFromImage()` and `GridComposite` are physics-agnostic. The `.mcp.json` from space-engine-ts can be reused.

For audio: see `~/github/game/tools/` for Suno automation (music), OpenAI TTS (narration), and procedural SFX synthesis patterns.

## Files from space-engine-ts NOT ported (physics-specific)

- `src/engine/particles.ts`: SoA particle storage (replaced by Rapier bodies)
- `src/engine/bonds.ts`: Spring bonds (replaced by rigid body physics)
- `src/engine/tree.ts`: Barnes-Hut quadtree (replaced by brute-force gravity)
- `src/engine/physics.ts`: Leapfrog integrator (replaced by Rapier's solver)
- `src/engine/grid.ts`: Spatial hash grid for collisions (Rapier handles this)
- `src/engine/world.ts`: Wraps Particles + Physics (replaced by Rapier.World)
- `src/engine/gravity-pool.ts` / `gravity-worker.ts`: Parallel gravity workers (not needed initially)
- `src/engine/rigid-composite.ts`: Virtual rigid body with rep particle (replaced by Rapier bodies)
- `src/engine/particle-remove.ts`: Swap-remove fixup (not needed, Rapier manages its own indices)
- `src/game/galaxy.ts`: Needs rewrite for Rapier (the SpawnedComposite/RigidComposite arrays become SpawnedBody arrays)
- `src/game/ship.ts`: Needs rewrite (thrust/rotation via Rapier addForce/addTorque instead of particle manipulation)
- `src/game/orbit.ts`: Orbit stabilizer (rewrite for Rapier velocity correction)
- `src/game/procgen.ts`: Planet/asteroid generation (rewrite spawn calls)
- `src/game/terrain.ts`: Terrain generation (output is GridComposite, physics-agnostic, but not yet copied)
- `src/game/mine.ts`: Mining (rewrite: remove colliders instead of particles)
- `src/game/volcano.ts`: Volcano effects (rewrite for Rapier particle emission)
- `src/render/renderer.ts`: Large file, needs careful port
- `src/game/hyperspace.ts`: HyperspaceWorld (rewrite for Rapier world)
- `src/game/states/hyperspace-flight.ts`: Flight state (rewrite physics loop)
- `src/game/game-loop.ts`, `input-bindings.ts`, `builder-ui.ts`, `npc-dialog-ui.ts`: Extracted main.ts modules (rewrite for Rapier integration)
