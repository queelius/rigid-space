# Wire main.ts to Ported Code: Design Spec

**Date:** 2026-03-19
**Priority:** 1 (from CLAUDE.md roadmap)
**Scope:** Replace proof-of-concept `main.ts` with a proper game skeleton using ported infrastructure

## Summary

Replace the hardcoded proof-of-concept `main.ts` (~207 lines of inline bodies, raw key listeners, immediate-mode rendering) with a modular game skeleton that uses `GridComposite` + `spawnComposite()` for body creation, `InputManager` for controls, `ScreenStack` for UI state, `EventBus` for decoupled events, YAML config for gameplay values, and a fixed-timestep game loop. The old `GameContext` is rewritten from scratch for Rapier.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full context wiring | Sets up complete game skeleton in one pass |
| Old GameContext | Clean slate rewrite | Old one imports 8 non-existent modules; Rapier-native is smaller and correct |
| Game loop | Fixed timestep with accumulator | Rapier expects consistent dt; gameplay.yaml already defines timestep |
| Body management | Tagged registry with auto-ID | Scales to planets/stations/projectiles without type changes |
| Rendering | Interface + immediate-mode impl | Visible results now; Priority 2 swaps in sprite-based impl without touching game loop |
| Module organization | Thin main.ts + focused modules | Each module testable in isolation; main.ts is pure composition |

## New Module Map

### Files to Create

| File | Purpose |
|------|---------|
| `src/engine/body-registry.ts` | Tagged `SpawnedBody` registry with ID-based lookup |
| `src/engine/gravity.ts` | N-body gravity (brute force, extracted from main.ts) |
| `src/game/ship.ts` | Ship class wrapping SpawnedBody: thrust, rotation, camera target |
| `src/game/game-context.ts` | **Rewritten**: Rapier-native context (replaces old one) |
| `src/game/game-loop.ts` | Fixed-timestep loop with accumulator, RAF wrapper |
| `src/render/body-renderer.ts` | Renderer interface + immediate-mode GraphicsBodyRenderer |
| `src/main.ts` | **Rewritten**: thin composition root (~50 lines) |

### Files to Delete

| File | Reason |
|------|--------|
| `src/game/hud-data.ts` | Imports old particle engine types (`Particles`, `Composites`); not salvageable |

### Files Unchanged (used as-is)

- `src/engine/grid-composite.ts`, `src/engine/rigid-spawn.ts`, `src/engine/types.ts`, `src/engine/events.ts`
- `src/game/input.ts`, `src/game/screen-stack.ts`
- `src/config/loader.ts`
- All screen states under `src/game/states/*` (not wired yet, left intact)

### Dependencies to Install (step 1 of implementation)

These packages are already imported by existing ported files (`config/loader.ts`, `game/input.ts`, `game/trade.ts`) but are missing from `package.json`. Install before any other work:

- `js-yaml` (runtime, add to `dependencies`)
- `@types/js-yaml` (dev, add to `devDependencies`)

## Module Designs

### BodyRegistry (`src/engine/body-registry.ts`)

```typescript
interface RegistryEntry {
  id: number
  tag: string          // 'star', 'ship', 'asteroid', 'station', 'projectile', etc.
  spawned: SpawnedBody
}
```

**API:**
- `add(tag: string, spawned: SpawnedBody): number`. Registers, returns auto-incremented ID.
- `remove(world: RAPIER.World, id: number): boolean`. Clears all colliders from the `SpawnedBody.colliderMap`, calls `world.removeRigidBody(body)`, deletes entry.
- `get(id: number): RegistryEntry | undefined`
- `getByTag(tag: string): RegistryEntry[]`. All entries with that tag.
- `firstByTag(tag: string): RegistryEntry | undefined`. Convenience for singletons (star, ship).
- `all(): RegistryEntry[]`. Full iteration (for gravity, rendering).
- `[Symbol.iterator]`. Iterates RegistryEntry values.

The registry does not own the Rapier World. `remove()` takes the world as a parameter to clean up the rigid body. The caller is responsible for also calling `renderer.onBodyRemoved(id)` when needed (no-op for the immediate-mode renderer, but required for Priority 2's sprite-based renderer).

### Gravity (`src/engine/gravity.ts`)

```typescript
export function applyGravity(
  registry: BodyRegistry,
  G: number,
  attractorTag?: string,
): void
```

- If `attractorTag` is provided: only bodies with that tag attract, all others are attracted. Avoids O(N^2).
- If omitted: full N-body pairwise gravity. Each pair computed once with equal-opposite forces applied to both bodies.
- Skips kinematic bodies as targets.
- Minimum distance clamped to avoid singularity (dist < 5 guard).
- Pure function: no state, no class.

### Ship (`src/game/ship.ts`)

```typescript
export class Ship {
  readonly registryId: number
  readonly spawned: SpawnedBody
  thrustStrength: number  // from gameplay.yaml
  rotationRate: number    // from gameplay.yaml
}
```

**API:**
- `constructor(registryId: number, spawned: SpawnedBody, config: GameplayShipConfig)`
- `applyControls(input: InputManager): void`. Reads `thrust_forward`, `thrust_backward`, `rotate_left`, `rotate_right` from InputManager, applies `addForce`/`addTorque`. Must run before `world.step()` in the same physics tick since Rapier clears forces after each step.
- `position(): { x: number, y: number }`. From Rapier body translation.
- `velocity(): { x: number, y: number }`. From Rapier body linvel.
- `speed(): number`. Velocity magnitude.
- `rotation(): number`. From Rapier body rotation.

Ship grid is a hardcoded small GridComposite (cockpit + thrusters + fuel) at startup. Builder and image-import provide these later.

### GameContext (`src/game/game-context.ts`), rewritten

```typescript
export interface GameContext {
  rapierWorld: RAPIER.World
  registry: BodyRegistry
  ship: Ship
  input: InputManager
  screenStack: ScreenStack
  events: EventBus
  config: GameConfig
  renderer: BodyRenderer
  camera: { x: number; y: number; zoom: number }
}
```

Plain interface, not a class. `main.ts` constructs the object directly. Galaxy, Builder, QuestLog, TradeState, SoundEngine, NPC get added when their systems are wired (Priority 2+).

### BodyRenderer Interface + Immediate-Mode Impl (`src/render/body-renderer.ts`)

```typescript
export interface BodyRenderer {
  renderBodies(registry: BodyRegistry, camera: { x: number; y: number; zoom: number }): void
  onBodyAdded(entry: RegistryEntry): void
  onBodyRemoved(id: number): void
  resize(width: number, height: number): void
}
```

**GraphicsBodyRenderer:**
- Takes PixiJS `Graphics` and screen dimensions
- `renderBodies()`: clears graphics, iterates registry, draws colored rectangle per grid cell at body's world position + rotation offset. Uses `typeProps(cell.type)` for color.
- Star tag gets circle rendering instead of cell grid.
- `onBodyAdded`/`onBodyRemoved`: no-ops. Priority 2's SpriteBodyRenderer will use these for texture baking.

HUD rendering stays on `#hud` canvas (Canvas2D), reads from GameContext.

### GameLoop (`src/game/game-loop.ts`)

```typescript
export interface GameLoopCallbacks {
  fixedUpdate(dt: number): void
  render(interpolation: number): void
}

export function startGameLoop(
  timestep: number,
  callbacks: GameLoopCallbacks,
): { stop: () => void }
```

- Tracks elapsed time via `performance.now()`
- Accumulates real delta, consumes in fixed timestep chunks
- Caps accumulator to `timestep * 5` (spiral-of-death prevention)
- `fixedUpdate` called per physics step: gravity, ship controls, `rapierWorld.step()`, screen stack update
- `render` called once per frame after all physics steps
- Returns `stop()` handle that cancels RAF. For test cleanup, the caller should also remove InputManager keyboard listeners via `removeEventListener`
- Respects `screenStack.paused`: skips physics (ship controls, gravity, `rapierWorld.step()`) but still calls `screenStack.update()` and render

### main.ts (Thin Composition Root)

```typescript
async function main() {
  // 1. Init Rapier WASM
  await RAPIER.init()

  // 2. Load config, apply type properties
  const config = await loadConfig()
  applyTypeConfig(config.types)

  // 3. Init PixiJS
  const app = new Application()
  await app.init({ canvas, resizeTo: window, backgroundColor: 0x050510, antialias: true, preference: 'webgl' })

  // 4. Create core systems
  const rapierWorld = new RAPIER.World(new RAPIER.Vector2(0, 0))
  const registry = new BodyRegistry()
  const input = new InputManager()
  await input.loadConfig()
  window.addEventListener('keydown', e => input.handleKeyDown(e))
  window.addEventListener('keyup', e => input.handleKeyUp(e))
  const screenStack = new ScreenStack()
  const events = new EventBus()
  const renderer = new GraphicsBodyRenderer(app)

  // 5. Spawn initial bodies via GridComposite + spawnComposite
  //    Star: 1x1 EXOTIC grid, kinematic, cellScale=50
  //      After spawn: remove cuboid collider, add ball(50) collider,
  //      delete stale colliderMap entry
  //    Ship: ~3x5 grid (COCKPIT, THRUSTERs, FUEL), dynamic, cellScale=10
  //    Asteroids: 20x random 1x1-3x3 ROCK grids, random orbital velocities

  // 6. Build GameContext object

  // 7. Start fixed-timestep game loop
  startGameLoop(config.gameplay.physics.timestep, {
    fixedUpdate(dt) {
      if (!screenStack.paused) {
        ship.applyControls(input)
        applyGravity(registry, 50000, 'star')
        rapierWorld.step()
      }
      screenStack.update(dt)
    },
    render() {
      ctx.camera.x = ship.position().x
      ctx.camera.y = ship.position().y
      renderer.renderBodies(registry, ctx.camera)
      renderHUD(ctx)  // inline function in main.ts, draws text overlay on #hud canvas
      // screenStack.render(hudCtx, w, h)  // wired when screen states are connected
    },
  })
}
```

**Star collider override:** `spawnComposite` creates a cuboid collider for the 1x1 grid cell. For the star, we replace it with a ball collider (radius 50, matching the PoC) so it renders and collides as a circle:

1. Get the cuboid collider from `spawned.colliderMap.get("0,0")`
2. Call `world.removeCollider(collider, false)`
3. Create `RAPIER.ColliderDesc.ball(50).setDensity(100)` and attach to the body
4. Delete the stale `"0,0"` key from colliderMap (star does not need per-cell damage)

**`renderHUD`** is an inline function in `main.ts` that draws the text overlay on the `#hud` Canvas2D (body count, speed, controls hint). Same content as the current PoC but reads from GameContext instead of magic array indices. Extracted to its own module in Priority 2.

## Cleanup

- **Delete** `src/game/hud-data.ts`
- **Fix** `RAPIER.init({})` → `RAPIER.init()` (TS error)
- **Goal state:** `npx tsc --noEmit` produces zero errors for all files imported from `main.ts`. Unconnected ported files may still have type errors but are not part of the import graph.

## Testing Strategy

### Unit Tests (no Rapier WASM)

- **GridComposite**: set/get/clear, serialization round-trip, edgeMask, countType
- **BodyRegistry**: add/remove/getByTag/iterate, ID auto-increment
- **EventBus**: on/emit/off/clear
- **GameLoop**: mock `performance.now`, verify fixed-step accumulator calls fixedUpdate correct number of times, verify spiral-of-death cap

### Integration Tests (need `RAPIER.init()`)

- **spawnComposite**: collider count matches filled cells, COM offset correct
- **removeCell**: collider removed from body
- **gravity**: two bodies, verify force direction and magnitude
- **Ship.applyControls**: mock InputManager, verify forces applied

### Deferred (Priority 2+)

- Rendering (visual, needs PixiJS canvas)
- Screen states
- Config loading (needs Vite dev server for fetch)

Tests live in `src/**/*.test.ts` alongside the modules they test. The existing `vitest.config.ts` only includes `tests/**/*.test.ts`, so update it to also include `src/**/*.test.ts`.
