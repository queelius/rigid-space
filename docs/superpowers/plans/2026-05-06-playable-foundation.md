# Playable Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Rapier-wired tech demo into a stock playable game foundation: SC2-feel ship controls, event-driven audio, three-state menu stack (MainMenu → GameHUD → PauseMenu), minimum visual feedback (camera follow + shake + thruster glow). Textures, weapons, damage, music, and settings are explicitly deferred to follow-up plans.

**Architecture:** All work is additive over the existing `EventBus` / `BodyRegistry` / `Ship` / `BodyRenderer` / `ScreenStack` / `SoundEngine` infrastructure. Six new files (Camera, lifecycle, collision-events, three menu states), ten file modifications, no deletions. State classes use constructor callback injection for testability and to avoid circular imports between `lifecycle.ts` and the state files.

**Tech Stack:** TypeScript, Rapier2D-compat (WASM), PixiJS v8, vitest, js-yaml, Vite.

**Spec reference:** `docs/superpowers/specs/2026-05-06-playable-foundation-design.md`. Read the spec before starting; it has rationale and risks the plan does not duplicate.

**Worktree:** Optional. If desired, create one before starting via the `superpowers:using-git-worktrees` skill so the work is isolated from `master`.

**Test commands (used throughout):**
- Run a single test file: `npx vitest run src/path/to/file.test.ts`
- Run all tests: `npx vitest run`
- Type check: `npx tsc --noEmit`
- Dev server (manual smoke): `npx vite`

---

## File Structure (locked decisions)

### Files to create

| Path | Responsibility |
|------|----------------|
| `src/game/camera.ts` | `Camera` class: target follow with frame-rate-independent lerp, shake decay |
| `src/game/collision-events.ts` | `drainCollisionEvents()`: read Rapier `EventQueue`, compute impact energy, emit `COLLISION` events |
| `src/game/lifecycle.ts` | `spawnInitialWorld(ctx)`, `despawnAll(ctx)`, `updateAudio(ctx)`, `createContext(...)` factory |
| `src/game/states/main-menu.ts` | `MainMenu` ScreenState (Start / Quit). Takes `onStart` and `onQuit` callbacks. |
| `src/game/states/game-hud.ts` | `GameHUD` ScreenState (non-pausing overlay, pushes PauseMenu on Esc). Takes `onPause` callback. |
| `src/game/states/pause-menu.ts` | `PauseMenu` ScreenState (Resume / Quit to Main). Takes `onResume` and `onQuitToMain` callbacks. |

### Files to modify

| Path | Change summary |
|------|----------------|
| `public/assets/config/gameplay.yaml` | Add `ship.max_speed`, `ship.linear_damping`, `ship.angular_damping`, `ship.reverse_thrust_factor`. Raise `thrust_strength` and `rotation_rate`. |
| `src/config/loader.ts` | Extend `GameplayShipConfig` interface with the four new fields. |
| `src/engine/body-registry.ts` | Add `findByBody()`, `metadata` field on `RegistryEntry`, optional 3rd arg to `add()`. |
| `src/engine/rigid-spawn.ts` | Refactor `spawnComposite` to take a trailing options object; add `linearDamping`, `angularDamping`, `enableCollisionEvents` support. |
| `src/game/ship.ts` | Add `maxSpeed`, `reverseThrustFactor`, `_thrusting`, `clampSpeed()`, `isThrusting()`. |
| `src/game/sound.ts` | Add `subscribeTo(bus)` method that derives event handlers from `config.events` keys. |
| `src/game/game-context.ts` | Replace `camera: { x, y, zoom }` with `camera: Camera`; add `soundEngine`, `eventQueue`, `app`, `hudCanvas`; make `ship: Ship \| undefined`. |
| `src/render/body-renderer.ts` | Update `renderBodies(reg, cam, ship?)` signature. Read `cam.effectiveX/Y`. Draw thruster glow if ship is thrusting. |
| `src/main.ts` | Becomes thin bootstrap: build context, register input dispatch, COLLISION→shake handler, push `MainMenu` (or call `bootDevMode` on `?dev=1`), start loop. |

### Test files to create

| Path | Targets |
|------|---------|
| `src/game/camera.test.ts` | `Camera`: target lerp, shake decay, max-of-shake, frame-rate independence |
| `src/game/sound.test.ts` | `SoundEngine.subscribeTo`: throws before init, registers handler per event |
| `src/game/collision-events.test.ts` | `drainCollisionEvents`: emits on high-energy contact, gates by threshold, populates tags |
| `src/game/states/main-menu.test.ts` | `MainMenu`: arrow nav wraps, Enter triggers callbacks |
| `src/game/states/game-hud.test.ts` | `GameHUD`: Esc invokes onPause |
| `src/game/states/pause-menu.test.ts` | `PauseMenu`: Esc/Resume pop, Quit invokes callback |
| `src/game/lifecycle.test.ts` | `spawnInitialWorld` populates registry; `despawnAll` clears |

---

## Task 1: Add ship config fields to YAML and loader interface

**Files:**
- Modify: `public/assets/config/gameplay.yaml`
- Modify: `src/config/loader.ts:159-168`

This task adds schema only. No code consumes the new fields yet; that arrives in Task 7.

- [ ] **Step 1: Edit `public/assets/config/gameplay.yaml`**

Replace the existing `ship:` block (top of file, lines 1-5) with:

```yaml
ship:
  thrust_strength: 2000        # raised from 500; tune empirically in Task 15
  rotation_rate: 40            # raised from 12; tune empirically in Task 15
  max_speed: 250               # NEW: hard cap on linear velocity magnitude
  linear_damping: 0            # NEW: 0 = Newtonian drift
  angular_damping: 5           # NEW: high so rotation snaps to halt on key release
  reverse_thrust_factor: 0.5   # NEW: was hardcoded; expose for tuning
  cannon:
    mass: 1.0
    speed: 400
```

- [ ] **Step 2: Edit `src/config/loader.ts`**

Replace `GameplayShipConfig` interface (currently lines 164-168) with:

```typescript
export interface GameplayShipConfig {
  thrust_strength: number
  rotation_rate: number
  max_speed: number
  linear_damping: number
  angular_damping: number
  reverse_thrust_factor: number
  cannon: GameplayShipCannonConfig
}
```

- [ ] **Step 3: Verify build still compiles**

Run: `npx tsc --noEmit`

Expected: no errors. Existing `Ship` constructor takes a `GameplayShipConfig` but only reads `thrust_strength` and `rotation_rate`. Adding new required fields means callers must supply them, but the only caller is `src/main.ts:70` which loads config from YAML at runtime, so type-check passes against the YAML-derived type.

If errors point to `src/game/ship.test.ts` (it builds a `GameplayShipConfig` literal that lacks the new fields), do not fix here. Task 7 rewrites that test fixture.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`

Expected: all currently-passing tests still pass. (One existing test file may now have a TS error in Step 3; that is OK if it does not cause vitest to fail. If it does, mark this task blocked and rewind to fix the test fixture inline.)

- [ ] **Step 5: Commit**

```bash
git add public/assets/config/gameplay.yaml src/config/loader.ts
git commit -m "$(cat <<'EOF'
feat(config): add ship feel fields (max_speed, linear/angular_damping, reverse_thrust_factor)

Schema-only change. Consumers wire up in Task 7 (Ship class).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend BodyRegistry with findByBody and metadata

**Files:**
- Modify: `src/engine/body-registry.ts`
- Modify: `src/engine/body-registry.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/engine/body-registry.test.ts` before the closing `})`:

```typescript
  it('findByBody returns matching entry', () => {
    const spawned = spawn()
    const id = registry.add('ship', spawned)
    const entry = registry.findByBody(spawned.body)
    expect(entry).toBeDefined()
    expect(entry!.id).toBe(id)
    expect(entry!.tag).toBe('ship')
  })

  it('findByBody returns undefined for unknown body', () => {
    registry.add('a', spawn())
    const otherWorld = new RAPIER.World(new RAPIER.Vector2(0, 0))
    const otherBody = otherWorld.createRigidBody(RAPIER.RigidBodyDesc.dynamic())
    expect(registry.findByBody(otherBody)).toBeUndefined()
  })

  it('add accepts metadata as third argument', () => {
    const id = registry.add('star', spawn(), { proximityKey: 'star', radius: 50 })
    const entry = registry.get(id)
    expect(entry!.metadata).toEqual({ proximityKey: 'star', radius: 50 })
  })

  it('metadata is undefined when not provided', () => {
    const id = registry.add('asteroid', spawn())
    const entry = registry.get(id)
    expect(entry!.metadata).toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/body-registry.test.ts`

Expected: four FAILures: `findByBody is not a function` and metadata-related assertions fail.

- [ ] **Step 3: Implement**

Replace `src/engine/body-registry.ts` entirely with:

```typescript
import RAPIER from '@dimforge/rapier2d-compat'
import type { SpawnedBody } from './rigid-spawn'

export interface RegistryEntry {
  id: number
  tag: string
  spawned: SpawnedBody
  metadata?: { proximityKey?: string; radius?: number }
}

export class BodyRegistry {
  private entries = new Map<number, RegistryEntry>()
  private nextId = 0

  add(tag: string, spawned: SpawnedBody, metadata?: RegistryEntry['metadata']): number {
    const id = this.nextId++
    this.entries.set(id, { id, tag, spawned, metadata })
    return id
  }

  remove(world: RAPIER.World, id: number): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    for (const collider of entry.spawned.colliderMap.values()) {
      world.removeCollider(collider, false)
    }
    entry.spawned.colliderMap.clear()
    world.removeRigidBody(entry.spawned.body)
    this.entries.delete(id)
    return true
  }

  get(id: number): RegistryEntry | undefined {
    return this.entries.get(id)
  }

  getByTag(tag: string): RegistryEntry[] {
    const result: RegistryEntry[] = []
    for (const entry of this.entries.values()) {
      if (entry.tag === tag) result.push(entry)
    }
    return result
  }

  firstByTag(tag: string): RegistryEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.tag === tag) return entry
    }
    return undefined
  }

  findByBody(body: RAPIER.RigidBody): RegistryEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.spawned.body === body) return entry
    }
    return undefined
  }

  all(): RegistryEntry[] {
    return [...this.entries.values()]
  }

  [Symbol.iterator](): Iterator<RegistryEntry> {
    return this.entries.values()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/body-registry.test.ts`

Expected: all tests pass (existing ones plus the four new).

- [ ] **Step 5: Commit**

```bash
git add src/engine/body-registry.ts src/engine/body-registry.test.ts
git commit -m "$(cat <<'EOF'
feat(registry): add findByBody and optional metadata field

findByBody is needed by collision-events to resolve tags from Rapier RigidBody handles.
metadata.proximityKey/radius drives data-driven proximity ambient audio.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Camera class

**Files:**
- Create: `src/game/camera.ts`
- Create: `src/game/camera.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/camera.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Camera } from './camera'

describe('Camera', () => {
  let camera: Camera

  beforeEach(() => {
    camera = new Camera()
  })

  it('starts at origin with zoom 1', () => {
    expect(camera.x).toBe(0)
    expect(camera.y).toBe(0)
    expect(camera.zoom).toBe(1)
  })

  it('setTarget moves toward target on update', () => {
    camera.setTarget(100, 50)
    camera.update(0.1)
    expect(camera.x).toBeGreaterThan(0)
    expect(camera.x).toBeLessThan(100)
    expect(camera.y).toBeGreaterThan(0)
    expect(camera.y).toBeLessThan(50)
  })

  it('approaches target asymptotically over many ticks', () => {
    camera.setTarget(100, 100)
    for (let i = 0; i < 200; i++) camera.update(1 / 60)
    expect(camera.x).toBeCloseTo(100, 1)
    expect(camera.y).toBeCloseTo(100, 1)
  })

  it('frame-rate independence: 30fps and 144fps converge to similar positions over 1s', () => {
    const slow = new Camera(); slow.setTarget(100, 0)
    const fast = new Camera(); fast.setTarget(100, 0)
    for (let i = 0; i < 30; i++) slow.update(1 / 30)
    for (let i = 0; i < 144; i++) fast.update(1 / 144)
    // Both should be within 5 units of each other after 1 simulated second
    expect(Math.abs(slow.x - fast.x)).toBeLessThan(5)
  })

  it('shake decays toward zero', () => {
    camera.shake(1.0)
    for (let i = 0; i < 60; i++) camera.update(1 / 60)
    // After ~1s with decay=5, magnitude should be near zero
    expect(camera.effectiveX).toBe(camera.x)
    expect(camera.effectiveY).toBe(camera.y)
  })

  it('shake takes max of current and new magnitude', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    camera.shake(0.5)
    camera.update(1 / 60)
    const offsetAfterFirst = Math.abs(camera.effectiveX - camera.x)
    camera.shake(0.2) // smaller; should not reduce
    camera.update(1 / 60)
    const offsetAfterSecond = Math.abs(camera.effectiveX - camera.x)
    // After a second tick of same magnitude (since 0.2 < 0.5 was kept), offset stays in range
    expect(offsetAfterSecond).toBeGreaterThan(0)
    vi.restoreAllMocks()
  })

  it('effectiveX/Y equal x/y when no shake active', () => {
    camera.setTarget(50, 50)
    camera.update(1)
    expect(camera.effectiveX).toBe(camera.x)
    expect(camera.effectiveY).toBe(camera.y)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/camera.test.ts`

Expected: all FAIL with "Cannot find module './camera'".

- [ ] **Step 3: Implement**

Create `src/game/camera.ts`:

```typescript
/**
 * 2D camera with target-following and shake.
 * update() runs once per render frame (not per physics tick).
 */
export class Camera {
  x = 0
  y = 0
  zoom = 1

  private tx = 0
  private ty = 0
  /** Higher = snappier follow. Tunable. */
  smoothing = 8

  private shakeMag = 0
  /** 1 / seconds; controls how fast shake decays */
  shakeDecay = 5
  private shakeOX = 0
  private shakeOY = 0

  setTarget(x: number, y: number): void {
    this.tx = x
    this.ty = y
  }

  update(dt: number): void {
    // Frame-rate-independent exponential lerp toward target
    const k = 1 - Math.exp(-this.smoothing * dt)
    this.x += (this.tx - this.x) * k
    this.y += (this.ty - this.y) * k

    // Shake decay
    this.shakeMag *= Math.exp(-this.shakeDecay * dt)
    if (this.shakeMag < 0.01) {
      this.shakeMag = 0
      this.shakeOX = 0
      this.shakeOY = 0
    } else {
      this.shakeOX = (Math.random() - 0.5) * 2 * this.shakeMag * 10
      this.shakeOY = (Math.random() - 0.5) * 2 * this.shakeMag * 10
    }
  }

  /** Add shake of the given magnitude. Existing shake is preserved if larger. */
  shake(magnitude: number): void {
    this.shakeMag = Math.max(this.shakeMag, magnitude)
  }

  get effectiveX(): number {
    return this.x + this.shakeOX
  }

  get effectiveY(): number {
    return this.y + this.shakeOY
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/camera.test.ts`

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/camera.ts src/game/camera.test.ts
git commit -m "$(cat <<'EOF'
feat(camera): add Camera class with smooth follow and shake

Frame-rate-independent exponential lerp for target follow.
shake() takes max of current and new magnitude; decays exponentially.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: SoundEngine.subscribeTo

**Files:**
- Modify: `src/game/sound.ts`
- Create: `src/game/sound.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/sound.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SoundEngine } from './sound'
import { EventBus } from '../engine/events'
import type { SoundsConfig } from '../config/loader'

describe('SoundEngine.subscribeTo', () => {
  let engine: SoundEngine
  let bus: EventBus
  const minimalConfig: SoundsConfig = {
    proximity: {},
    events: {
      COLLISION: { type: 'synthetic', volume: 1, range: 1000 },
      CANNON_FIRE: { type: 'synthetic', volume: 1, range: 1000 },
    },
    continuous: {},
  }

  beforeEach(() => {
    engine = new SoundEngine()
    bus = new EventBus()
  })

  it('throws if called before init', () => {
    expect(() => engine.subscribeTo(bus)).toThrow(/init/i)
  })

  it('registers handler per event type when config is set', () => {
    // Set config without calling init (avoids AudioContext, which is unavailable in node)
    ;(engine as unknown as { config: SoundsConfig }).config = minimalConfig
    const playEventSpy = vi.spyOn(engine, 'playEvent').mockImplementation(() => {})

    engine.subscribeTo(bus)
    bus.emit({ type: 'COLLISION', x: 10, y: 20, energy: 500 })
    bus.emit({ type: 'CANNON_FIRE', x: 0, y: 0 })

    expect(playEventSpy).toHaveBeenCalledTimes(2)
    expect(playEventSpy).toHaveBeenNthCalledWith(1, 'COLLISION', 10, 20, 500)
    expect(playEventSpy).toHaveBeenNthCalledWith(2, 'CANNON_FIRE', 0, 0, undefined)
  })

  it('does not subscribe to events not in config', () => {
    ;(engine as unknown as { config: SoundsConfig }).config = minimalConfig
    const playEventSpy = vi.spyOn(engine, 'playEvent').mockImplementation(() => {})

    engine.subscribeTo(bus)
    bus.emit({ type: 'UNKNOWN_EVENT', x: 0, y: 0 })

    expect(playEventSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/sound.test.ts`

Expected: FAILures: `engine.subscribeTo is not a function`.

- [ ] **Step 3: Implement**

Edit `src/game/sound.ts`. After the `init()` method (around line 32), add:

```typescript
import type { EventBus } from '../engine/events'
```

at the top of the imports (alongside the existing `SoundsConfig`/`EventSoundConfig` import).

Then add this method to the `SoundEngine` class, immediately after `init()`:

```typescript
  /** Subscribe to all event types declared in sounds.yaml. Must be called after init. */
  subscribeTo(bus: EventBus): void {
    if (!this.config) {
      throw new Error('SoundEngine.subscribeTo: init() must be called before subscribeTo()')
    }
    for (const eventType of Object.keys(this.config.events)) {
      bus.on(eventType, e => this.playEvent(
        eventType,
        e.x,
        e.y,
        e.energy as number | undefined,
      ))
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/sound.test.ts`

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/sound.ts src/game/sound.test.ts
git commit -m "$(cat <<'EOF'
feat(sound): add SoundEngine.subscribeTo (config-driven event handlers)

Derives bus.on(...) calls from Object.keys(config.events) so adding a new
event sound becomes a YAML-only change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: spawnComposite options-object refactor

**Files:**
- Modify: `src/engine/rigid-spawn.ts`
- Modify: `src/engine/rigid-spawn.test.ts`
- Modify: `src/engine/body-registry.test.ts` (callers using `spawnComposite`)
- Modify: `src/game/ship.test.ts` (callers using `spawnComposite`)
- Modify: `src/main.ts` (three callers)

The signature changes from `(world, grid, x, y, vx, vy, cellScale, kinematic?)` to `(world, grid, x, y, vx, vy, cellScale, opts?: SpawnOptions)`. All callsites are updated atomically in this commit so the build stays green.

- [ ] **Step 1: Write failing tests**

Append to `src/engine/rigid-spawn.test.ts` before the final closing `})` of `describe('removeCell', ...)`:

```typescript
})  // close existing describe('removeCell', ...) if it is open

describe('spawnComposite options', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  function unitGrid(): GridComposite {
    const g = new GridComposite(1, 1)
    g.set(0, 0, Type.ROCK)
    return g
  }

  it('kinematic option produces kinematic body', () => {
    const spawned = spawnComposite(world, unitGrid(), 0, 0, 0, 0, 10, { kinematic: true })
    expect(spawned.body.isKinematic()).toBe(true)
  })

  it('linearDamping option propagates to body', () => {
    const spawned = spawnComposite(world, unitGrid(), 0, 0, 0, 0, 10, { linearDamping: 1.5 })
    expect(spawned.body.linearDamping()).toBeCloseTo(1.5, 5)
  })

  it('angularDamping option propagates to body', () => {
    const spawned = spawnComposite(world, unitGrid(), 0, 0, 0, 0, 10, { angularDamping: 5 })
    expect(spawned.body.angularDamping()).toBeCloseTo(5, 5)
  })

  it('enableCollisionEvents sets ActiveEvents on each collider', () => {
    const grid = new GridComposite(2, 1)
    grid.set(0, 0, Type.ROCK); grid.set(1, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10, { enableCollisionEvents: true })
    for (const c of spawned.colliderMap.values()) {
      expect(c.activeEvents()).toBe(RAPIER.ActiveEvents.COLLISION_EVENTS)
    }
  })

  it('omitting opts produces dynamic body with zero damping (default)', () => {
    const spawned = spawnComposite(world, unitGrid(), 0, 0, 0, 0, 10)
    expect(spawned.body.isKinematic()).toBe(false)
    expect(spawned.body.linearDamping()).toBeCloseTo(0, 5)
    expect(spawned.body.angularDamping()).toBeCloseTo(0, 5)
  })
})
```

Then update the existing `it('kinematic body is kinematic', ...)` test (around line 45-50) to use the new signature:

```typescript
  it('kinematic body is kinematic', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.EXOTIC)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10, { kinematic: true })
    expect(spawned.body.isKinematic()).toBe(true)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/rigid-spawn.test.ts`

Expected: FAILures from the new tests (option fields not handled). The updated `kinematic body is kinematic` test will fail with a type error.

- [ ] **Step 3: Implement**

Replace `src/engine/rigid-spawn.ts` `spawnComposite` (currently lines 29-89) with:

```typescript
export interface SpawnOptions {
  kinematic?: boolean
  linearDamping?: number
  angularDamping?: number
  enableCollisionEvents?: boolean
}

/**
 * Spawn a grid composite as a compound rigid body.
 * Each filled cell gets a box collider at the cell's offset from center.
 */
export function spawnComposite(
  world: RAPIER.World,
  grid: GridComposite,
  x: number,
  y: number,
  vx = 0,
  vy = 0,
  cellScale = 10,
  opts: SpawnOptions = {},
): SpawnedBody {
  // Compute center of mass
  let totalMass = 0
  let comX = 0, comY = 0
  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      const cell = grid.get(gx, gy)
      if (!cell) continue
      const mass = typeProps(cell.type).defaultMass
      const cx = (gx - grid.width / 2 + 0.5) * cellScale
      const cy = (gy - grid.height / 2 + 0.5) * cellScale
      comX += cx * mass
      comY += cy * mass
      totalMass += mass
    }
  }
  if (totalMass > 0) {
    comX /= totalMass
    comY /= totalMass
  }

  // Create rigid body
  let desc = opts.kinematic
    ? RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y)
    : RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setLinvel(vx, vy)
  if (opts.linearDamping !== undefined) desc = desc.setLinearDamping(opts.linearDamping)
  if (opts.angularDamping !== undefined) desc = desc.setAngularDamping(opts.angularDamping)
  const body = world.createRigidBody(desc)

  // Create one box collider per filled cell, offset from COM
  const halfCell = cellScale / 2
  const colliderMap = new Map<string, RAPIER.Collider>()

  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      const cell = grid.get(gx, gy)
      if (!cell) continue

      const localX = (gx - grid.width / 2 + 0.5) * cellScale - comX
      const localY = (gy - grid.height / 2 + 0.5) * cellScale - comY
      const mass = typeProps(cell.type).defaultMass

      let colliderDesc = RAPIER.ColliderDesc.cuboid(halfCell, halfCell)
        .setTranslation(localX, localY)
        .setDensity(mass / (cellScale * cellScale))
        .setRestitution(0.3)

      if (opts.enableCollisionEvents) {
        colliderDesc = colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      }

      const collider = world.createCollider(colliderDesc, body)
      colliderMap.set(`${gx},${gy}`, collider)
    }
  }

  return { body, colliderMap, totalMass, grid, cellScale }
}
```

Now update callers:

**`src/engine/body-registry.test.ts`**: the `spawn` helper (around line 21-25) still uses positional sig without kinematic, so it works unchanged.

**`src/game/ship.test.ts`**: the `spawnComposite` call (around line 33) does not pass `kinematic`, so works unchanged. The `Ship` constructor in line 34 uses an old-shape `GameplayShipConfig` that lacks the new fields from Task 1; update the literal to include them:

```typescript
  function makeShip(): Ship {
    const grid = makeShipGrid()
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    return new Ship(0, spawned, {
      thrust_strength: 500,
      rotation_rate: 12,
      max_speed: 250,
      linear_damping: 0,
      angular_damping: 5,
      reverse_thrust_factor: 0.5,
      cannon: { mass: 1, speed: 400 },
    })
  }
```

(Ship reads only `thrust_strength`/`rotation_rate` for now; the rest are placeholder fields it will start using in Task 7. Build must compile, so all fields are needed.)

**`src/main.ts`**: three callers. Update each:

Line 49 (star spawn) changes from:
```typescript
  const starSpawned = spawnComposite(rapierWorld, starGrid, 0, 0, 0, 0, 50, true)
```
to:
```typescript
  const starSpawned = spawnComposite(rapierWorld, starGrid, 0, 0, 0, 0, 50, { kinematic: true })
```

Line 68 (ship spawn) and line 91 (asteroid spawn) do not pass kinematic; they remain unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run`

Expected: all tests pass (including existing ones and the five new option tests).

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/rigid-spawn.ts src/engine/rigid-spawn.test.ts src/game/ship.test.ts src/main.ts
git commit -m "$(cat <<'EOF'
refactor(rigid-spawn): replace positional kinematic flag with options object

Adds linearDamping, angularDamping, enableCollisionEvents options.
All three callsites updated atomically.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: collision-events.ts (drainCollisionEvents)

**Files:**
- Create: `src/game/collision-events.ts`
- Create: `src/game/collision-events.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/collision-events.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { drainCollisionEvents } from './collision-events'
import { BodyRegistry } from '../engine/body-registry'
import { EventBus, type GameEvent } from '../engine/events'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'
import { spawnComposite } from '../engine/rigid-spawn'

describe('drainCollisionEvents', () => {
  let world: RAPIER.World
  let queue: RAPIER.EventQueue
  let registry: BodyRegistry
  let bus: EventBus
  let received: GameEvent[]

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
    queue = new RAPIER.EventQueue(true)
    registry = new BodyRegistry()
    bus = new EventBus()
    received = []
    bus.on('COLLISION', e => received.push(e))
  })

  function spawnAt(tag: string, x: number, vx: number) {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, x, 0, vx, 0, 10, {
      enableCollisionEvents: true,
    })
    registry.add(tag, spawned)
    return spawned
  }

  it('emits COLLISION event when two bodies collide above threshold', () => {
    spawnAt('ship', -20, 100)        // moves right
    spawnAt('asteroid', 20, -100)    // moves left
    // Step world until they collide
    for (let i = 0; i < 30; i++) {
      world.step(queue)
      drainCollisionEvents(world, queue, registry, bus, 0)
      if (received.length > 0) break
    }
    expect(received.length).toBeGreaterThan(0)
    const event = received[0]
    expect(event.type).toBe('COLLISION')
    expect(event.energy).toBeGreaterThan(0)
    const tags = event.tags as string[]
    expect(tags).toContain('ship')
    expect(tags).toContain('asteroid')
  })

  it('does not emit when energy is below threshold', () => {
    spawnAt('ship', -20, 1)          // very slow
    spawnAt('asteroid', 20, -1)
    for (let i = 0; i < 100; i++) {
      world.step(queue)
      drainCollisionEvents(world, queue, registry, bus, 10000)  // huge threshold
    }
    expect(received).toEqual([])
  })

  it('event position is midpoint of contacting bodies', () => {
    spawnAt('a', -20, 100)
    spawnAt('b', 20, -100)
    for (let i = 0; i < 30; i++) {
      world.step(queue)
      drainCollisionEvents(world, queue, registry, bus, 0)
      if (received.length > 0) break
    }
    const event = received[0]
    // Midpoint should be near origin since bodies collide near it
    expect(Math.abs(event.x)).toBeLessThan(20)
    expect(Math.abs(event.y)).toBeLessThan(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/collision-events.test.ts`

Expected: all FAIL with "Cannot find module './collision-events'".

- [ ] **Step 3: Implement**

Create `src/game/collision-events.ts`:

```typescript
import RAPIER from '@dimforge/rapier2d-compat'
import type { BodyRegistry } from '../engine/body-registry'
import type { EventBus } from '../engine/events'

/**
 * Drain Rapier's collision event queue and emit COLLISION events
 * on the EventBus when impact energy meets the threshold.
 *
 * Energy = 0.5 * (m1 + m2) * |v1 - v2|. Position = midpoint of body translations.
 * Tags are resolved via registry.findByBody. Should be called once per fixedUpdate
 * immediately after world.step(eventQueue).
 */
export function drainCollisionEvents(
  world: RAPIER.World,
  queue: RAPIER.EventQueue,
  registry: BodyRegistry,
  events: EventBus,
  energyThreshold: number,
): void {
  queue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return
    const c1 = world.getCollider(h1)
    const c2 = world.getCollider(h2)
    if (!c1 || !c2) return
    const b1 = c1.parent()
    const b2 = c2.parent()
    if (!b1 || !b2) return

    const v1 = b1.linvel()
    const v2 = b2.linvel()
    const dvx = v1.x - v2.x
    const dvy = v1.y - v2.y
    const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy)
    const energy = 0.5 * (b1.mass() + b2.mass()) * relSpeed
    if (energy < energyThreshold) return

    const t1 = b1.translation()
    const t2 = b2.translation()
    const tag1 = registry.findByBody(b1)?.tag
    const tag2 = registry.findByBody(b2)?.tag

    events.emit({
      type: 'COLLISION',
      x: (t1.x + t2.x) * 0.5,
      y: (t1.y + t2.y) * 0.5,
      energy,
      tags: [tag1, tag2],
    })
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/collision-events.test.ts`

Expected: all 3 tests pass. If "emits COLLISION event" times out, raise the loop count to 100.

- [ ] **Step 5: Commit**

```bash
git add src/game/collision-events.ts src/game/collision-events.test.ts
git commit -m "$(cat <<'EOF'
feat(collision-events): drain Rapier EventQueue into EventBus COLLISION events

Computes impact energy as 0.5*(m1+m2)*|v1-v2|, gates by threshold,
resolves body tags via registry.findByBody.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Ship feel additions (maxSpeed, clampSpeed, isThrusting, reverseThrustFactor)

**Files:**
- Modify: `src/game/ship.ts`
- Modify: `src/game/ship.test.ts`
- Modify: `src/main.ts` (Ship instantiation must pass new config)

- [ ] **Step 1: Write failing tests**

Append to `src/game/ship.test.ts` before the final `})`:

```typescript
  it('clampSpeed reduces velocity magnitude to maxSpeed', () => {
    const ship = makeShip()
    ship.spawned.body.setLinvel(new RAPIER.Vector2(500, 0), true)
    ship.clampSpeed()
    const v = ship.spawned.body.linvel()
    expect(Math.sqrt(v.x * v.x + v.y * v.y)).toBeCloseTo(250, 0)
  })

  it('clampSpeed preserves direction', () => {
    const ship = makeShip()
    ship.spawned.body.setLinvel(new RAPIER.Vector2(300, 400), true)  // mag=500, dir=(0.6, 0.8)
    ship.clampSpeed()
    const v = ship.spawned.body.linvel()
    expect(v.x / 250).toBeCloseTo(0.6, 1)
    expect(v.y / 250).toBeCloseTo(0.8, 1)
  })

  it('clampSpeed is no-op when below maxSpeed', () => {
    const ship = makeShip()
    ship.spawned.body.setLinvel(new RAPIER.Vector2(100, 0), true)
    ship.clampSpeed()
    const v = ship.spawned.body.linvel()
    expect(v.x).toBe(100)
    expect(v.y).toBe(0)
  })

  it('isThrusting is false initially', () => {
    const ship = makeShip()
    expect(ship.isThrusting()).toBe(false)
  })

  it('isThrusting becomes true when thrust_forward is held', () => {
    const ship = makeShip()
    const input = new InputManager()
    input['actionToKey'].set('thrust_forward', 'w')
    input['keyHeld']['w'] = true
    ship.applyControls(input)
    expect(ship.isThrusting()).toBe(true)
  })

  it('isThrusting becomes false when thrust released', () => {
    const ship = makeShip()
    const input = new InputManager()
    input['actionToKey'].set('thrust_forward', 'w')
    input['keyHeld']['w'] = true
    ship.applyControls(input)
    input['keyHeld']['w'] = false
    ship.applyControls(input)
    expect(ship.isThrusting()).toBe(false)
  })
```

Also add the missing import at the top:
```typescript
import RAPIER from '@dimforge/rapier2d-compat'
```
(if not already imported in this file).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/ship.test.ts`

Expected: FAILures: `clampSpeed is not a function`, `isThrusting is not a function`.

- [ ] **Step 3: Implement**

Replace `src/game/ship.ts` entirely with:

```typescript
import RAPIER from '@dimforge/rapier2d-compat'
import type { SpawnedBody } from '../engine/rigid-spawn'
import type { InputManager } from './input'
import type { GameplayShipConfig } from '../config/loader'

export class Ship {
  readonly registryId: number
  readonly spawned: SpawnedBody
  thrustStrength: number
  rotationRate: number
  maxSpeed: number
  reverseThrustFactor: number

  private _thrusting = false

  constructor(registryId: number, spawned: SpawnedBody, config: GameplayShipConfig) {
    this.registryId = registryId
    this.spawned = spawned
    this.thrustStrength = config.thrust_strength
    this.rotationRate = config.rotation_rate
    this.maxSpeed = config.max_speed
    this.reverseThrustFactor = config.reverse_thrust_factor
  }

  applyControls(input: InputManager): void {
    const fwd = input.isAction('thrust_forward')
    const back = input.isAction('thrust_backward')
    this._thrusting = fwd || back

    const body = this.spawned.body
    const angle = body.rotation()
    const fx = -Math.sin(angle)
    const fy = Math.cos(angle)

    if (fwd) {
      body.addForce(new RAPIER.Vector2(fx * this.thrustStrength, fy * this.thrustStrength), true)
    }
    if (back) {
      const rev = this.thrustStrength * this.reverseThrustFactor
      body.addForce(new RAPIER.Vector2(-fx * rev, -fy * rev), true)
    }
    if (input.isAction('rotate_left')) {
      body.addTorque(-this.rotationRate, true)
    }
    if (input.isAction('rotate_right')) {
      body.addTorque(this.rotationRate, true)
    }
  }

  /** Clamp linear velocity magnitude to maxSpeed. Call after world.step(). */
  clampSpeed(): void {
    const v = this.spawned.body.linvel()
    const mag = Math.sqrt(v.x * v.x + v.y * v.y)
    if (mag > this.maxSpeed) {
      const k = this.maxSpeed / mag
      this.spawned.body.setLinvel(new RAPIER.Vector2(v.x * k, v.y * k), true)
    }
  }

  isThrusting(): boolean {
    return this._thrusting
  }

  position(): { x: number; y: number } {
    const t = this.spawned.body.translation()
    return { x: t.x, y: t.y }
  }

  velocity(): { x: number; y: number } {
    const v = this.spawned.body.linvel()
    return { x: v.x, y: v.y }
  }

  speed(): number {
    const v = this.spawned.body.linvel()
    return Math.sqrt(v.x * v.x + v.y * v.y)
  }

  rotation(): number {
    return this.spawned.body.rotation()
  }
}
```

Now update `src/main.ts` Ship instantiation. Currently around line 70:

```typescript
  const ship = new Ship(shipId, shipSpawned, config.gameplay.ship)
```

This already takes the full ship config so no change needed if `config.gameplay.ship` carries the new fields (it does after Task 1's YAML edit). Verify by running the type check.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/ship.test.ts`

Expected: all tests pass (existing 5 + new 6).

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/ship.ts src/game/ship.test.ts
git commit -m "$(cat <<'EOF'
feat(ship): add maxSpeed clamp, isThrusting, reverseThrustFactor

clampSpeed scales linvel down to maxSpeed (post world.step()).
isThrusting tracked on each applyControls call (used by renderer for glow).
reverseThrustFactor replaces hardcoded 0.5 reverse multiplier.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update GameContext shape and main.ts construction

**Files:**
- Modify: `src/game/game-context.ts`
- Modify: `src/main.ts`

This task updates the type shape and adopts `Camera` + `SoundEngine` + `EventQueue` in `main.ts`. Game behavior is preserved (no menu yet, no audio init yet); the wiring is just made ready for Task 14. Build stays green.

- [ ] **Step 1: Replace `src/game/game-context.ts`**

```typescript
import type RAPIER from '@dimforge/rapier2d-compat'
import type { Application } from 'pixi.js'
import type { BodyRegistry } from '../engine/body-registry'
import type { Ship } from './ship'
import type { InputManager } from './input'
import type { ScreenStack } from './screen-stack'
import type { EventBus } from '../engine/events'
import type { GameConfig } from '../config/loader'
import type { BodyRenderer } from '../render/body-renderer'
import type { Camera } from './camera'
import type { SoundEngine } from './sound'

export interface GameContext {
  app: Application
  hudCanvas: HTMLCanvasElement
  rapierWorld: RAPIER.World
  eventQueue: RAPIER.EventQueue
  registry: BodyRegistry
  ship: Ship | undefined           // populated by enterPlaying, cleared by exitToMainMenu
  input: InputManager
  screenStack: ScreenStack
  events: EventBus
  config: GameConfig
  renderer: BodyRenderer
  camera: Camera
  soundEngine: SoundEngine
}
```

- [ ] **Step 2: Update `src/main.ts` to construct the new shape**

Replace the entire `main()` function with:

```typescript
import RAPIER from '@dimforge/rapier2d-compat'
import { Application } from 'pixi.js'
import { loadConfig } from './config/loader'
import { applyTypeConfig, Type } from './engine/types'
import { GridComposite } from './engine/grid-composite'
import { spawnComposite } from './engine/rigid-spawn'
import { BodyRegistry } from './engine/body-registry'
import { applyGravity } from './engine/gravity'
import { Ship } from './game/ship'
import { InputManager } from './game/input'
import { ScreenStack } from './game/screen-stack'
import { EventBus } from './engine/events'
import { GraphicsBodyRenderer } from './render/body-renderer'
import { createGameLoop } from './game/game-loop'
import { Camera } from './game/camera'
import { SoundEngine } from './game/sound'
import { drainCollisionEvents } from './game/collision-events'
import type { GameContext } from './game/game-context'

async function main() {
  await RAPIER.init()

  const config = await loadConfig()
  applyTypeConfig(config.types)

  const app = new Application()
  await app.init({
    canvas: document.getElementById('game') as HTMLCanvasElement,
    resizeTo: window,
    backgroundColor: 0x050510,
    antialias: true,
    preference: 'webgl',
  })

  const hudCanvas = document.getElementById('hud') as HTMLCanvasElement

  const rapierWorld = new RAPIER.World(new RAPIER.Vector2(0, 0))
  const eventQueue = new RAPIER.EventQueue(true)
  const registry = new BodyRegistry()
  const input = new InputManager()
  await input.loadConfig()
  window.addEventListener('keydown', e => input.handleKeyDown(e))
  window.addEventListener('keyup', e => input.handleKeyUp(e))
  const screenStack = new ScreenStack()
  const events = new EventBus()
  const renderer = new GraphicsBodyRenderer(app)
  const camera = new Camera()
  const soundEngine = new SoundEngine()

  // Spawn star
  const starGrid = new GridComposite(1, 1)
  starGrid.set(0, 0, Type.EXOTIC)
  const starSpawned = spawnComposite(rapierWorld, starGrid, 0, 0, 0, 0, 50, { kinematic: true })
  const starCuboid = starSpawned.colliderMap.get('0,0')!
  rapierWorld.removeCollider(starCuboid, false)
  rapierWorld.createCollider(
    RAPIER.ColliderDesc.ball(50)
      .setDensity(100)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    starSpawned.body,
  )
  starSpawned.colliderMap.delete('0,0')
  registry.add('star', starSpawned, { proximityKey: 'star', radius: 50 })

  // Spawn ship
  const shipGrid = new GridComposite(3, 5)
  shipGrid.set(1, 4, Type.COCKPIT)
  shipGrid.set(0, 2, Type.THRUSTER)
  shipGrid.set(2, 2, Type.THRUSTER)
  shipGrid.set(1, 2, Type.REACTOR)
  shipGrid.set(1, 1, Type.FUEL)
  shipGrid.set(1, 0, Type.FUEL)
  const shipSpawned = spawnComposite(rapierWorld, shipGrid, 500, 0, 0, 0, 10, {
    linearDamping: config.gameplay.ship.linear_damping,
    angularDamping: config.gameplay.ship.angular_damping,
    enableCollisionEvents: true,
  })
  const shipId = registry.add('ship', shipSpawned)
  const ship = new Ship(shipId, shipSpawned, config.gameplay.ship)

  // Spawn asteroids
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = 150 + Math.random() * 400
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    const v = 20 + Math.random() * 15
    const vx = -Math.sin(angle) * v
    const vy = Math.cos(angle) * v
    const size = 1 + Math.floor(Math.random() * 3)
    const grid = new GridComposite(size, size)
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        if (Math.random() < 0.7) {
          grid.set(gx, gy, Math.random() < 0.2 ? Type.IRON : Type.ROCK)
        }
      }
    }
    const spawned = spawnComposite(rapierWorld, grid, x, y, vx, vy, 8, {
      enableCollisionEvents: true,
    })
    registry.add('asteroid', spawned)
  }

  const ctx: GameContext = {
    app, hudCanvas,
    rapierWorld, eventQueue,
    registry, ship, input, screenStack, events,
    config, renderer, camera, soundEngine,
  }

  // HUD render (inline; replaced by GameHUD state in Task 14)
  function renderHUD(): void {
    const w = app.screen.width
    const h = app.screen.height
    if (hudCanvas.width !== w) hudCanvas.width = w
    if (hudCanvas.height !== h) hudCanvas.height = h
    const hctx = hudCanvas.getContext('2d')!
    hctx.clearRect(0, 0, w, h)
    hctx.fillStyle = '#aaa'
    hctx.font = '14px monospace'
    hctx.fillText('Rigid Space  |  Rapier2D WASM', 10, 20)
    hctx.fillText(`Bodies: ${registry.all().length}  |  WASD: fly`, 10, 40)
    hctx.fillText(`Speed: ${ship.speed().toFixed(0)} / ${ship.maxSpeed}`, 10, 60)
  }

  const loop = createGameLoop(config.gameplay.physics.timestep, {
    fixedUpdate(_dt) {
      if (!screenStack.paused) {
        ship.applyControls(input)
        applyGravity(registry, 50000, 'star')
        rapierWorld.step(eventQueue)
        drainCollisionEvents(rapierWorld, eventQueue, registry, events,
                             config.gameplay.collision.event_threshold)
        ship.clampSpeed()
      }
      screenStack.update(_dt)
    },
    render(_interpolation) {
      camera.setTarget(ship.position().x, ship.position().y)
      camera.update(1 / 60)
      renderer.renderBodies(registry, camera)
      renderHUD()
    },
  })

  loop.start()
}

main()
```

- [ ] **Step 3: Verify build and tests**

Run: `npx tsc --noEmit`

Expected: no errors.

Run: `npx vitest run`

Expected: all tests pass.

- [ ] **Step 4: Manual smoke check**

Run: `npx vite`

Open the localhost URL. Expected: game runs as before, but ship now has SC2 feel: hold W to thrust, ship accelerates over a few seconds, top speed caps at 250, releasing turn keys causes rotation to halt within ~0.5s. Stop the dev server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add src/game/game-context.ts src/main.ts
git commit -m "$(cat <<'EOF'
refactor: adopt Camera/SoundEngine/EventQueue in GameContext and main.ts

GameContext gains app, hudCanvas, eventQueue, soundEngine, camera (now Camera class).
ship becomes Ship | undefined for upcoming menu lifecycle.
Star ball collider gets ActiveEvents.COLLISION_EVENTS.
Ship spawns at (500, 0) at rest with SC2 damping config.

Behavior change: ship now feels like SC2 (drift, capped speed, snappy rotation).
No menu yet; that arrives in Task 14.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: BodyRenderer signature change and thruster glow

**Files:**
- Modify: `src/render/body-renderer.ts`
- Modify: `src/main.ts` (single call site)

- [ ] **Step 1: Update `src/render/body-renderer.ts`**

Replace the file entirely with:

```typescript
import { Graphics, Application } from 'pixi.js'
import type { BodyRegistry, RegistryEntry } from '../engine/body-registry'
import { typeProps } from '../engine/types'
import type { Camera } from '../game/camera'
import type { Ship } from '../game/ship'

export interface BodyRenderer {
  renderBodies(registry: BodyRegistry, camera: Camera, ship?: Ship): void
  onBodyAdded(entry: RegistryEntry): void
  onBodyRemoved(id: number): void
  resize(width: number, height: number): void
}

const TYPE_COLORS: number[] = [
  0x888888, 0xAAAAAA, 0x333333, 0xFFAA00, 0xDD4444,
  0x44DDFF, 0xFF4444, 0x4488FF, 0xFFDD44, 0xFF8800,
  0x44FF44, 0x886644, 0x8888FF, 0x220022, 0x664422,
  0x22AA22, 0xCCEEFF, 0xDDCC88, 0xFF4400, 0xAA44FF,
]

export class GraphicsBodyRenderer implements BodyRenderer {
  private gfx: Graphics
  private app: Application

  constructor(app: Application) {
    this.app = app
    this.gfx = new Graphics()
    app.stage.addChild(this.gfx)
  }

  renderBodies(registry: BodyRegistry, camera: Camera, ship?: Ship): void {
    const w = this.app.screen.width
    const h = this.app.screen.height
    const camX = camera.effectiveX
    const camY = camera.effectiveY
    const zoom = camera.zoom

    this.gfx.clear()

    for (const entry of registry) {
      const body = entry.spawned.body
      const pos = body.translation()
      const rot = body.rotation()
      const cos = Math.cos(-rot)
      const sin = Math.sin(-rot)
      const grid = entry.spawned.grid
      const cellScale = entry.spawned.cellScale

      if (entry.tag === 'star') {
        const sx = w / 2 + (pos.x - camX) * zoom
        const sy = h / 2 - (pos.y - camY) * zoom
        const radius = cellScale * zoom
        this.gfx.circle(sx, sy, radius).fill(0xFFDD44)
        continue
      }

      const halfCell = (cellScale / 2) * zoom

      let totalMass = 0, comX = 0, comY = 0
      for (let gy = 0; gy < grid.height; gy++) {
        for (let gx = 0; gx < grid.width; gx++) {
          const cell = grid.get(gx, gy)
          if (!cell) continue
          const mass = typeProps(cell.type).defaultMass
          comX += (gx - grid.width / 2 + 0.5) * cellScale * mass
          comY += (gy - grid.height / 2 + 0.5) * cellScale * mass
          totalMass += mass
        }
      }
      if (totalMass > 0) { comX /= totalMass; comY /= totalMass }

      for (let gy = 0; gy < grid.height; gy++) {
        for (let gx = 0; gx < grid.width; gx++) {
          const cell = grid.get(gx, gy)
          if (!cell) continue

          const color = grid.getCellColor(gx, gy) ?? TYPE_COLORS[cell.type] ?? 0xFFFFFF

          const localX = ((gx - grid.width / 2 + 0.5) * cellScale - comX) * zoom
          const localY = ((gy - grid.height / 2 + 0.5) * cellScale - comY) * zoom

          const worldX = localX * cos - localY * sin
          const worldY = localX * sin + localY * cos

          const sx = w / 2 + (pos.x - camX) * zoom + worldX
          const sy = h / 2 - (pos.y - camY) * zoom - worldY

          this.gfx.rect(sx - halfCell, sy - halfCell, halfCell * 2, halfCell * 2).fill(color)
        }
      }
    }

    // Thruster glow: drawn after bodies so it appears on top of any rectangle behind ship
    if (ship?.isThrusting()) {
      const sp = ship.position()
      const sx = w / 2 + (sp.x - camX) * zoom
      const sy = h / 2 - (sp.y - camY) * zoom
      const angle = ship.rotation()
      const offset = 25 * zoom
      this.gfx.ellipse(
        sx + Math.sin(angle) * offset,
        sy - Math.cos(angle) * offset,
        12 * zoom,
        20 * zoom,
      ).fill({ color: 0xff8833, alpha: 0.6 })
    }
  }

  onBodyAdded(_entry: RegistryEntry): void {}
  onBodyRemoved(_id: number): void {}
  resize(_width: number, _height: number): void {}
}
```

- [ ] **Step 2: Update `src/main.ts` render callback**

Find the `render(_interpolation)` block in `main.ts` (Task 8 added it). Change:
```typescript
      renderer.renderBodies(registry, camera)
```
to:
```typescript
      renderer.renderBodies(registry, camera, ship)
```

- [ ] **Step 3: Type check and tests**

Run: `npx tsc --noEmit && npx vitest run`

Expected: no errors; all tests pass.

- [ ] **Step 4: Manual smoke check**

Run: `npx vite`. Open game. Hold W: an orange ellipse should appear behind the ship while thrusting and disappear when released. Stop server.

- [ ] **Step 5: Commit**

```bash
git add src/render/body-renderer.ts src/main.ts
git commit -m "$(cat <<'EOF'
feat(renderer): adopt Camera + thruster glow for ship

renderBodies(reg, cam, ship?) reads cam.effectiveX/Y for shake support.
Optional ship arg drives a translucent ellipse drawn behind the ship body
when isThrusting() is true.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: MainMenu state

**Files:**
- Create: `src/game/states/main-menu.ts`
- Create: `src/game/states/main-menu.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/states/main-menu.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MainMenu } from './main-menu'

describe('MainMenu', () => {
  let onStart: ReturnType<typeof vi.fn>
  let onQuit: ReturnType<typeof vi.fn>
  let menu: MainMenu

  beforeEach(() => {
    onStart = vi.fn()
    onQuit = vi.fn()
    menu = new MainMenu({ onStart, onQuit })
  })

  it('has pausesPhysics true', () => {
    expect(menu.pausesPhysics).toBe(true)
  })

  it('starts with selectedIndex 0 (Start)', () => {
    expect(menu.selectedIndex).toBe(0)
  })

  it('arrowdown moves selection forward', () => {
    menu.handleKey('arrowdown')
    expect(menu.selectedIndex).toBe(1)
  })

  it('arrowup wraps from first to last', () => {
    menu.handleKey('arrowup')
    expect(menu.selectedIndex).toBe(1)  // last option (Quit)
  })

  it('arrowdown wraps from last to first', () => {
    menu.handleKey('arrowdown')
    menu.handleKey('arrowdown')
    expect(menu.selectedIndex).toBe(0)
  })

  it('w/s also navigate', () => {
    menu.handleKey('s')
    expect(menu.selectedIndex).toBe(1)
    menu.handleKey('w')
    expect(menu.selectedIndex).toBe(0)
  })

  it('Enter on Start calls onStart', () => {
    menu.handleKey('enter')
    expect(onStart).toHaveBeenCalled()
    expect(onQuit).not.toHaveBeenCalled()
  })

  it('Space on Start calls onStart', () => {
    menu.handleKey(' ')
    expect(onStart).toHaveBeenCalled()
  })

  it('Enter on Quit calls onQuit', () => {
    menu.handleKey('arrowdown')
    menu.handleKey('enter')
    expect(onQuit).toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('returns true for handled keys, false for others', () => {
    expect(menu.handleKey('arrowdown')).toBe(true)
    expect(menu.handleKey('q')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/states/main-menu.test.ts`

Expected: FAIL with "Cannot find module './main-menu'".

- [ ] **Step 3: Implement**

Create `src/game/states/main-menu.ts`:

```typescript
import type { ScreenState } from '../screen-stack'

export interface MainMenuCallbacks {
  onStart: () => void
  onQuit: () => void
}

export class MainMenu implements ScreenState {
  name = 'main-menu'
  pausesPhysics = true
  selectedIndex = 0
  readonly options = ['Start', 'Quit']

  private callbacks: MainMenuCallbacks

  constructor(callbacks: MainMenuCallbacks) {
    this.callbacks = callbacks
  }

  update(_dt: number): void {}

  handleInput(_action: string): boolean {
    return false
  }

  handleKey(key: string): boolean {
    if (key === 'arrowup' || key === 'w') {
      this.selectedIndex = (this.selectedIndex + this.options.length - 1) % this.options.length
      return true
    }
    if (key === 'arrowdown' || key === 's') {
      this.selectedIndex = (this.selectedIndex + 1) % this.options.length
      return true
    }
    if (key === 'enter' || key === ' ') {
      const opt = this.options[this.selectedIndex]
      if (opt === 'Start') this.callbacks.onStart()
      else if (opt === 'Quit') this.callbacks.onQuit()
      return true
    }
    return false
  }

  render(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    c2d.fillStyle = '#050510'
    c2d.fillRect(0, 0, w, h)

    c2d.fillStyle = '#fff'
    c2d.font = 'bold 48px monospace'
    c2d.textAlign = 'center'
    c2d.fillText('RIGID SPACE', w / 2, h / 2 - 80)

    c2d.font = '20px monospace'
    this.options.forEach((opt, i) => {
      c2d.fillStyle = i === this.selectedIndex ? '#ffdd44' : '#aaaaaa'
      const prefix = i === this.selectedIndex ? '> ' : '  '
      c2d.fillText(prefix + opt, w / 2, h / 2 + i * 40)
    })

    c2d.font = '14px monospace'
    c2d.fillStyle = '#666'
    c2d.fillText('arrows or W/S to navigate, Enter to select', w / 2, h - 40)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/states/main-menu.test.ts`

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/states/main-menu.ts src/game/states/main-menu.test.ts
git commit -m "$(cat <<'EOF'
feat(states): add MainMenu (Start / Quit)

Constructor takes onStart and onQuit callbacks (DI pattern, avoids
circular import with lifecycle.ts). Keyboard navigation only:
arrows/WS + Enter/Space.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: GameHUD state

**Files:**
- Create: `src/game/states/game-hud.ts`
- Create: `src/game/states/game-hud.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/states/game-hud.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GameHUD, type GameHUDViewModel } from './game-hud'

describe('GameHUD', () => {
  let onPause: ReturnType<typeof vi.fn>
  let viewModel: GameHUDViewModel
  let hud: GameHUD

  beforeEach(() => {
    onPause = vi.fn()
    viewModel = {
      bodyCount: () => 22,
      shipSpeed: () => 100,
      shipMaxSpeed: () => 250,
      shipPosition: () => ({ x: 500, y: 0 }),
    }
    hud = new GameHUD(viewModel, { onPause })
  })

  it('has pausesPhysics false', () => {
    expect(hud.pausesPhysics).toBe(false)
  })

  it('Esc invokes onPause and returns true', () => {
    expect(hud.handleKey('escape')).toBe(true)
    expect(onPause).toHaveBeenCalledOnce()
  })

  it('non-Esc keys return false and do not invoke onPause', () => {
    expect(hud.handleKey('w')).toBe(false)
    expect(hud.handleKey('a')).toBe(false)
    expect(hud.handleKey('enter')).toBe(false)
    expect(onPause).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/states/game-hud.test.ts`

Expected: FAIL with "Cannot find module './game-hud'".

- [ ] **Step 3: Implement**

Create `src/game/states/game-hud.ts`:

```typescript
import type { ScreenState } from '../screen-stack'

/** Read-only data the HUD needs. Decouples HUD from full GameContext for testability. */
export interface GameHUDViewModel {
  bodyCount(): number
  shipSpeed(): number
  shipMaxSpeed(): number
  shipPosition(): { x: number; y: number }
}

export interface GameHUDCallbacks {
  onPause: () => void
}

export class GameHUD implements ScreenState {
  name = 'game-hud'
  pausesPhysics = false

  private vm: GameHUDViewModel
  private callbacks: GameHUDCallbacks

  constructor(viewModel: GameHUDViewModel, callbacks: GameHUDCallbacks) {
    this.vm = viewModel
    this.callbacks = callbacks
  }

  update(_dt: number): void {}

  handleInput(_action: string): boolean {
    return false
  }

  handleKey(key: string): boolean {
    if (key === 'escape') {
      this.callbacks.onPause()
      return true
    }
    return false
  }

  render(c2d: CanvasRenderingContext2D, _w: number, _h: number): void {
    c2d.fillStyle = '#aaaaaa'
    c2d.font = '14px monospace'
    c2d.textAlign = 'left'
    c2d.fillText('Rigid Space  |  WASD: fly  |  Esc: pause', 10, 20)
    c2d.fillText(`Speed: ${this.vm.shipSpeed().toFixed(0)} / ${this.vm.shipMaxSpeed()}`, 10, 40)
    const p = this.vm.shipPosition()
    c2d.fillText(`Pos: ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`, 10, 60)
    c2d.fillText(`Bodies: ${this.vm.bodyCount()}`, 10, 80)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/states/game-hud.test.ts`

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/states/game-hud.ts src/game/states/game-hud.test.ts
git commit -m "$(cat <<'EOF'
feat(states): add GameHUD (non-pausing overlay; Esc pushes pause)

Takes a ViewModel interface so HUD is decoupled from the full GameContext.
Esc invokes onPause callback (lifecycle wires to push PauseMenu).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: PauseMenu state

**Files:**
- Create: `src/game/states/pause-menu.ts`
- Create: `src/game/states/pause-menu.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/states/pause-menu.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PauseMenu } from './pause-menu'

describe('PauseMenu', () => {
  let onResume: ReturnType<typeof vi.fn>
  let onQuitToMain: ReturnType<typeof vi.fn>
  let menu: PauseMenu

  beforeEach(() => {
    onResume = vi.fn()
    onQuitToMain = vi.fn()
    menu = new PauseMenu({ onResume, onQuitToMain })
  })

  it('has pausesPhysics true', () => {
    expect(menu.pausesPhysics).toBe(true)
  })

  it('starts with Resume selected', () => {
    expect(menu.selectedIndex).toBe(0)
  })

  it('Esc invokes onResume', () => {
    expect(menu.handleKey('escape')).toBe(true)
    expect(onResume).toHaveBeenCalled()
  })

  it('Enter on Resume invokes onResume', () => {
    menu.handleKey('enter')
    expect(onResume).toHaveBeenCalled()
    expect(onQuitToMain).not.toHaveBeenCalled()
  })

  it('Enter on Quit to Main invokes onQuitToMain', () => {
    menu.handleKey('arrowdown')
    menu.handleKey('enter')
    expect(onQuitToMain).toHaveBeenCalled()
    expect(onResume).not.toHaveBeenCalled()
  })

  it('arrow nav wraps', () => {
    menu.handleKey('arrowup')
    expect(menu.selectedIndex).toBe(1)
    menu.handleKey('arrowdown')
    expect(menu.selectedIndex).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/states/pause-menu.test.ts`

Expected: FAIL with "Cannot find module './pause-menu'".

- [ ] **Step 3: Implement**

Create `src/game/states/pause-menu.ts`:

```typescript
import type { ScreenState } from '../screen-stack'

export interface PauseMenuCallbacks {
  onResume: () => void
  onQuitToMain: () => void
}

export class PauseMenu implements ScreenState {
  name = 'pause-menu'
  pausesPhysics = true
  selectedIndex = 0
  readonly options = ['Resume', 'Quit to Main']

  private callbacks: PauseMenuCallbacks

  constructor(callbacks: PauseMenuCallbacks) {
    this.callbacks = callbacks
  }

  update(_dt: number): void {}

  handleInput(_action: string): boolean {
    return false
  }

  handleKey(key: string): boolean {
    if (key === 'escape') {
      this.callbacks.onResume()
      return true
    }
    if (key === 'arrowup' || key === 'w') {
      this.selectedIndex = (this.selectedIndex + this.options.length - 1) % this.options.length
      return true
    }
    if (key === 'arrowdown' || key === 's') {
      this.selectedIndex = (this.selectedIndex + 1) % this.options.length
      return true
    }
    if (key === 'enter' || key === ' ') {
      const opt = this.options[this.selectedIndex]
      if (opt === 'Resume') this.callbacks.onResume()
      else if (opt === 'Quit to Main') this.callbacks.onQuitToMain()
      return true
    }
    return false
  }

  render(c2d: CanvasRenderingContext2D, w: number, h: number): void {
    c2d.fillStyle = 'rgba(0, 0, 0, 0.6)'
    c2d.fillRect(0, 0, w, h)

    c2d.fillStyle = '#ffffff'
    c2d.font = 'bold 36px monospace'
    c2d.textAlign = 'center'
    c2d.fillText('PAUSED', w / 2, h / 2 - 60)

    c2d.font = '20px monospace'
    this.options.forEach((opt, i) => {
      c2d.fillStyle = i === this.selectedIndex ? '#ffdd44' : '#aaaaaa'
      const prefix = i === this.selectedIndex ? '> ' : '  '
      c2d.fillText(prefix + opt, w / 2, h / 2 + i * 40)
    })

    c2d.font = '14px monospace'
    c2d.fillStyle = '#666'
    c2d.fillText('Esc to resume', w / 2, h / 2 + 120)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/states/pause-menu.test.ts`

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/states/pause-menu.ts src/game/states/pause-menu.test.ts
git commit -m "$(cat <<'EOF'
feat(states): add PauseMenu (Resume / Quit to Main)

Esc resumes; Enter on Resume resumes; Enter on Quit calls onQuitToMain.
Renders semi-transparent overlay over the live HUD.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: lifecycle.ts (spawn, despawn, audio update)

**Files:**
- Create: `src/game/lifecycle.ts`
- Create: `src/game/lifecycle.test.ts`

This module exports pure functions that operate on `GameContext`. It does not import any state class (callbacks are wired by `main.ts`), avoiding circular imports.

- [ ] **Step 1: Write failing tests**

Create `src/game/lifecycle.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { spawnInitialWorld, despawnAll } from './lifecycle'
import { BodyRegistry } from '../engine/body-registry'
import { Camera } from './camera'
import { EventBus } from '../engine/events'
import type { GameContext } from './game-context'
import type { GameConfig } from '../config/loader'

describe('lifecycle', () => {
  let world: RAPIER.World
  let registry: BodyRegistry
  let camera: Camera
  let ctx: GameContext

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
    registry = new BodyRegistry()
    camera = new Camera()
    // Minimal stub config; lifecycle reads only ship.* and collision.event_threshold
    const config = {
      gameplay: {
        ship: {
          thrust_strength: 2000, rotation_rate: 40, max_speed: 250,
          linear_damping: 0, angular_damping: 5, reverse_thrust_factor: 0.5,
          cannon: { mass: 1, speed: 400 },
        },
        physics: { substeps: 4, timestep: 0.016 },
        collision: { restitution: 0.5, heat_fraction: 0.1, break_threshold: 500, event_threshold: 100 },
      },
    } as unknown as GameConfig
    ctx = {
      app: null as never, hudCanvas: null as never,
      rapierWorld: world, eventQueue: new RAPIER.EventQueue(true),
      registry, ship: undefined,
      input: null as never, screenStack: null as never,
      events: new EventBus(),
      config, renderer: null as never, camera,
      soundEngine: null as never,
    }
  })

  it('spawnInitialWorld populates registry with star + ship + asteroids', () => {
    spawnInitialWorld(ctx)
    const all = ctx.registry.all()
    expect(all.length).toBeGreaterThan(20)  // 1 star + 1 ship + 20 asteroids
    expect(ctx.registry.firstByTag('star')).toBeDefined()
    expect(ctx.registry.firstByTag('ship')).toBeDefined()
    expect(ctx.registry.getByTag('asteroid').length).toBe(20)
    expect(ctx.ship).toBeDefined()
  })

  it('star has proximityKey metadata', () => {
    spawnInitialWorld(ctx)
    const star = ctx.registry.firstByTag('star')!
    expect(star.metadata?.proximityKey).toBe('star')
    expect(star.metadata?.radius).toBe(50)
  })

  it('despawnAll clears registry and ship', () => {
    spawnInitialWorld(ctx)
    despawnAll(ctx)
    expect(ctx.registry.all()).toHaveLength(0)
    expect(ctx.ship).toBeUndefined()
  })

  it('despawnAll is idempotent on empty world', () => {
    despawnAll(ctx)
    expect(ctx.registry.all()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/lifecycle.test.ts`

Expected: FAIL with "Cannot find module './lifecycle'".

- [ ] **Step 3: Implement**

Create `src/game/lifecycle.ts`:

```typescript
import RAPIER from '@dimforge/rapier2d-compat'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'
import { spawnComposite } from '../engine/rigid-spawn'
import { Ship } from './ship'
import type { GameContext } from './game-context'

/**
 * Populate an empty Rapier world with the playable scene: a central star,
 * a player ship at (500, 0) at rest, and 20 randomized orbiting asteroids.
 * Sets ctx.ship. Caller is responsible for pushing GameHUD onto the stack.
 */
export function spawnInitialWorld(ctx: GameContext): void {
  const { rapierWorld, registry, config } = ctx

  // Star: 1x1 EXOTIC kinematic. Replace cuboid with ball collider that has
  // ActiveEvents.COLLISION_EVENTS so ship-vs-star produces audio + shake.
  const starGrid = new GridComposite(1, 1)
  starGrid.set(0, 0, Type.EXOTIC)
  const starSpawned = spawnComposite(rapierWorld, starGrid, 0, 0, 0, 0, 50, { kinematic: true })
  const starCuboid = starSpawned.colliderMap.get('0,0')!
  rapierWorld.removeCollider(starCuboid, false)
  rapierWorld.createCollider(
    RAPIER.ColliderDesc.ball(50)
      .setDensity(100)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    starSpawned.body,
  )
  starSpawned.colliderMap.delete('0,0')
  registry.add('star', starSpawned, { proximityKey: 'star', radius: 50 })

  // Ship: 3x5 grid at (500, 0) with SC2 damping
  const shipGrid = new GridComposite(3, 5)
  shipGrid.set(1, 4, Type.COCKPIT)
  shipGrid.set(0, 2, Type.THRUSTER)
  shipGrid.set(2, 2, Type.THRUSTER)
  shipGrid.set(1, 2, Type.REACTOR)
  shipGrid.set(1, 1, Type.FUEL)
  shipGrid.set(1, 0, Type.FUEL)
  const shipSpawned = spawnComposite(rapierWorld, shipGrid, 500, 0, 0, 0, 10, {
    linearDamping: config.gameplay.ship.linear_damping,
    angularDamping: config.gameplay.ship.angular_damping,
    enableCollisionEvents: true,
  })
  const shipId = registry.add('ship', shipSpawned)
  ctx.ship = new Ship(shipId, shipSpawned, config.gameplay.ship)

  // Asteroids: 20 randomized 1x1 to 3x3 ROCK/IRON grids in rough orbits
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = 150 + Math.random() * 400
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    const v = 20 + Math.random() * 15
    const vx = -Math.sin(angle) * v
    const vy = Math.cos(angle) * v
    const size = 1 + Math.floor(Math.random() * 3)
    const grid = new GridComposite(size, size)
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        if (Math.random() < 0.7) {
          grid.set(gx, gy, Math.random() < 0.2 ? Type.IRON : Type.ROCK)
        }
      }
    }
    const spawned = spawnComposite(rapierWorld, grid, x, y, vx, vy, 8, {
      enableCollisionEvents: true,
    })
    registry.add('asteroid', spawned)
  }
}

/**
 * Tear down the playable scene: remove every body from Rapier and the registry,
 * silence continuous audio, reset camera. Caller is responsible for pushing MainMenu.
 */
export function despawnAll(ctx: GameContext): void {
  ctx.soundEngine?.setContinuous?.('thrust', false)
  for (const entry of ctx.registry.all()) {
    ctx.registry.remove(ctx.rapierWorld, entry.id)
  }
  ctx.ship = undefined
  ctx.camera.x = 0
  ctx.camera.y = 0
  ctx.camera.setTarget(0, 0)
}

/**
 * Per-fixedUpdate audio refresh: spatial position, thrust loop, proximity ambient.
 * Safe no-op when ship is undefined.
 */
export function updateAudio(ctx: GameContext): void {
  if (!ctx.ship) return
  const sp = ctx.ship.position()
  ctx.soundEngine.shipX = sp.x
  ctx.soundEngine.shipY = sp.y
  ctx.soundEngine.setContinuous('thrust', ctx.ship.isThrusting())

  for (const entry of ctx.registry) {
    const meta = entry.metadata
    if (!meta?.proximityKey) continue
    const ep = entry.spawned.body.translation()
    const dx = ep.x - sp.x
    const dy = ep.y - sp.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    ctx.soundEngine.updateProximity(
      meta.proximityKey,
      dist,
      entry.spawned.body.mass(),
      meta.radius,
    )
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/lifecycle.test.ts`

Expected: all 4 tests pass.

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/lifecycle.ts src/game/lifecycle.test.ts
git commit -m "$(cat <<'EOF'
feat(lifecycle): add spawnInitialWorld, despawnAll, updateAudio

Pure functions on GameContext; no state-class imports (avoids circular).
Star ball collider gets ActiveEvents.COLLISION_EVENTS.
updateAudio iterates registry metadata for data-driven proximity.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Wire boot flow in main.ts

**Files:**
- Modify: `src/main.ts`

This is the final wiring task. main.ts becomes the orchestrator: builds context, registers input dispatch, COLLISION→shake handler, boot route (MainMenu by default, dev shortcut for `?dev=1`), starts the loop with the ScreenStack-aware physics gate. World population moves to `lifecycle.spawnInitialWorld`.

- [ ] **Step 1: Replace `src/main.ts` entirely**

```typescript
import RAPIER from '@dimforge/rapier2d-compat'
import { Application } from 'pixi.js'
import { loadConfig } from './config/loader'
import { applyTypeConfig } from './engine/types'
import { BodyRegistry } from './engine/body-registry'
import { applyGravity } from './engine/gravity'
import { InputManager } from './game/input'
import { ScreenStack } from './game/screen-stack'
import { EventBus } from './engine/events'
import { GraphicsBodyRenderer } from './render/body-renderer'
import { createGameLoop } from './game/game-loop'
import { Camera } from './game/camera'
import { SoundEngine } from './game/sound'
import { drainCollisionEvents } from './game/collision-events'
import { spawnInitialWorld, despawnAll, updateAudio } from './game/lifecycle'
import { MainMenu } from './game/states/main-menu'
import { GameHUD } from './game/states/game-hud'
import { PauseMenu } from './game/states/pause-menu'
import type { GameContext } from './game/game-context'

async function main(): Promise<void> {
  await RAPIER.init()

  const config = await loadConfig()
  applyTypeConfig(config.types)

  const app = new Application()
  await app.init({
    canvas: document.getElementById('game') as HTMLCanvasElement,
    resizeTo: window,
    backgroundColor: 0x050510,
    antialias: true,
    preference: 'webgl',
  })
  const hudCanvas = document.getElementById('hud') as HTMLCanvasElement

  const input = new InputManager()
  await input.loadConfig()

  const ctx: GameContext = {
    app,
    hudCanvas,
    rapierWorld: new RAPIER.World(new RAPIER.Vector2(0, 0)),
    eventQueue: new RAPIER.EventQueue(true),
    registry: new BodyRegistry(),
    ship: undefined,
    input,
    screenStack: new ScreenStack(),
    events: new EventBus(),
    config,
    renderer: new GraphicsBodyRenderer(app),
    camera: new Camera(),
    soundEngine: new SoundEngine(),  // not init'd yet; init runs on user gesture
  }

  // Lifecycle helpers wired with state-pushing callbacks (avoids circular imports
  // between lifecycle.ts and the state classes)
  function enterPlaying(): void {
    spawnInitialWorld(ctx)
    ctx.screenStack.push(makeGameHUD())
  }

  function exitToMainMenu(): void {
    while (!ctx.screenStack.isEmpty) ctx.screenStack.pop()
    despawnAll(ctx)
    ctx.screenStack.push(makeMainMenu())
  }

  function pushPauseMenu(): void {
    ctx.screenStack.push(new PauseMenu({
      onResume: () => ctx.screenStack.pop(),
      onQuitToMain: exitToMainMenu,
    }))
  }

  function makeGameHUD(): GameHUD {
    return new GameHUD(
      {
        bodyCount: () => ctx.registry.all().length,
        shipSpeed: () => ctx.ship?.speed() ?? 0,
        shipMaxSpeed: () => ctx.ship?.maxSpeed ?? 0,
        shipPosition: () => ctx.ship?.position() ?? { x: 0, y: 0 },
      },
      { onPause: pushPauseMenu },
    )
  }

  function makeMainMenu(): MainMenu {
    return new MainMenu({
      onStart: () => {
        ctx.soundEngine.init(ctx.config.sounds)
        ctx.soundEngine.subscribeTo(ctx.events)
        ctx.screenStack.pop()
        enterPlaying()
      },
      onQuit: () => window.close(),
    })
  }

  // Input dispatch: ScreenStack first, then InputManager (poll-based gameplay)
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase()
    if (ctx.screenStack.handleKey(key)) e.preventDefault()
    ctx.input.handleKeyDown(e)
  })
  window.addEventListener('keyup', e => ctx.input.handleKeyUp(e))

  // Camera shake on ship-involved collisions
  ctx.events.on('COLLISION', e => {
    const tags = e.tags as string[] | undefined
    if (!tags?.includes('ship')) return
    ctx.camera.shake(Math.min((e.energy as number) / 500, 1.0))
  })

  // Boot route
  const dev = new URLSearchParams(location.search).has('dev')
  if (dev) {
    enterPlaying()
    // First keydown unlocks audio
    const onFirstKey = (): void => {
      ctx.soundEngine.init(ctx.config.sounds)
      ctx.soundEngine.subscribeTo(ctx.events)
      window.removeEventListener('keydown', onFirstKey)
    }
    window.addEventListener('keydown', onFirstKey)
  } else {
    ctx.screenStack.push(makeMainMenu())
  }

  createGameLoop(config.gameplay.physics.timestep, {
    fixedUpdate(dt) {
      if (!ctx.screenStack.paused && ctx.ship) {
        ctx.ship.applyControls(ctx.input)
        applyGravity(ctx.registry, 50000, 'star')
        ctx.rapierWorld.step(ctx.eventQueue)
        drainCollisionEvents(
          ctx.rapierWorld, ctx.eventQueue, ctx.registry,
          ctx.events, config.gameplay.collision.event_threshold,
        )
        ctx.ship.clampSpeed()
        updateAudio(ctx)
      }
      ctx.screenStack.update(dt)
    },
    render(_alpha) {
      const target = ctx.ship?.position() ?? { x: 0, y: 0 }
      ctx.camera.setTarget(target.x, target.y)
      ctx.camera.update(1 / 60)
      ctx.renderer.renderBodies(ctx.registry, ctx.camera, ctx.ship)

      const c2d = hudCanvas.getContext('2d')!
      const w = app.screen.width
      const h = app.screen.height
      if (hudCanvas.width !== w) hudCanvas.width = w
      if (hudCanvas.height !== h) hudCanvas.height = h
      c2d.clearRect(0, 0, w, h)
      ctx.screenStack.render(c2d, w, h)
    },
  }).start()
}

main()
```

- [ ] **Step 2: Type check and tests**

Run: `npx tsc --noEmit`

Expected: no errors.

Run: `npx vitest run`

Expected: all tests pass (no test for main.ts itself).

- [ ] **Step 3: Manual smoke test (full acceptance checklist)**

Run: `npx vite`. Open the browser to the localhost URL. Walk through:

1. **Boot screen visible:** "RIGID SPACE" title + Start/Quit options on a black background.
2. **Navigate menu:** ArrowDown highlights "Quit". ArrowUp highlights "Start" again.
3. **Start game:** Press Enter on Start. World appears: yellow star at center, ship rectangle at right. Low star drone audible (proximity ambient).
4. **Ship feel:** Hold W. Orange thruster glow appears behind ship. Ship accelerates over a few seconds. Top speed feels capped (HUD reads "Speed: 250 / 250" once at cap). Release W: ship drifts at constant velocity (no friction).
5. **Rotation feel:** Tap A. Ship rotates left and snaps to halt within ~0.5s. Hold A: ship reaches angular cap, stops accelerating spin.
6. **Collision feedback:** Steer ship into an asteroid. Camera shakes briefly. Audible thump.
7. **Pause:** Press Esc. Semi-transparent overlay appears with "PAUSED" + Resume/Quit. World frozen (asteroids stop). HUD remains visible underneath. Star ambient audio continues. Thrust loop is silent.
8. **Resume:** Press Esc again. World resumes from same state.
9. **Quit to Main:** Press Esc. Use ArrowDown to "Quit to Main". Press Enter. Title screen reappears. World cleared.
10. **Re-enter:** Press Enter on Start. Fresh world spawns; no audio re-init prompt.
11. **Dev shortcut:** Reload to `<localhost>?dev=1`. World appears immediately (no title). First keypress unlocks audio.

Note any failures. If a step fails, do not commit yet; investigate and fix in this task.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "$(cat <<'EOF'
feat(main): wire boot flow with MainMenu, GameHUD, PauseMenu

main.ts becomes a thin orchestrator: build context, register input dispatch,
COLLISION->shake handler, boot route (MainMenu by default, ?dev=1 skips to play).
Lifecycle helpers wired with state-pushing callbacks; world population moves
to lifecycle.spawnInitialWorld. ctx.ship is undefined except during play.

Acceptance: Start menu navigates, game runs with SC2 feel + thruster glow +
camera shake on hit, Esc pauses, Quit returns to title cleanly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Empirical tuning pass

**Files:**
- Modify: `public/assets/config/gameplay.yaml` (only)

After Task 14, the game runs end-to-end but the feel values from Task 1 are educated guesses. This task tunes them against the four tuning targets in the spec.

**Tuning targets** (from spec Section 2):
- T1: Time to reach top speed from rest, full forward thrust: 5 to 8 seconds.
- T2: Time to fully rotate 360 degrees from rest, holding one turn key: 2.5 to 3.5 seconds.
- T3: Time for rotation to stop after key release (90 percent decay): under 0.5 seconds.
- T4: Drift loss when thrust released for 5 seconds at top speed: essentially zero (preserve drift).

- [ ] **Step 1: Set up timing measurement**

Open `npx vite`. In the browser, open DevTools console. With the ship in flight, paste:

```javascript
// (from console; main.ts does not export ship; use registry instead)
// Locate ctx via window if needed; otherwise add a temporary `(window as any).ctx = ctx`
// line at the bottom of main() in src/main.ts during tuning, then revert.
```

If accessing `ctx.ship` from console is hard, add a temporary `(window as any).ctx = ctx` line to `main.ts` after the ctx object is built. Remove it before final commit.

- [ ] **Step 2: Measure and tune T1 (time to top speed)**

In console:
```javascript
ctx.ship.spawned.body.setLinvel({x:0,y:0}, true)
const t0 = performance.now()
const id = setInterval(() => {
  if (ctx.ship.speed() >= ctx.ship.maxSpeed - 1) {
    console.log('Time to cap:', (performance.now() - t0) / 1000, 's')
    clearInterval(id)
  }
}, 50)
// Then hold W in the game window
```

If under 5s: lower `thrust_strength`. If over 8s: raise it. Multiplicative adjustment, ~25 percent each iteration.

- [ ] **Step 3: Measure and tune T2 (rotation time)**

In console:
```javascript
ctx.ship.spawned.body.setAngvel(0, true)
ctx.ship.spawned.body.setRotation(0, true)
const t0 = performance.now()
const id = setInterval(() => {
  if (Math.abs(ctx.ship.spawned.body.rotation()) >= 2 * Math.PI - 0.1) {
    console.log('360 deg time:', (performance.now() - t0) / 1000, 's')
    clearInterval(id)
  }
}, 50)
// Then hold A in the game window
```

If under 2.5s: lower `rotation_rate`. If over 3.5s: raise it.

- [ ] **Step 4: Verify T3 (rotation stop time)**

In console after spinning the ship up by holding A then releasing:
```javascript
const a0 = Math.abs(ctx.ship.spawned.body.angvel())
const target = a0 * 0.1   // 90 percent decay
const t0 = performance.now()
const id = setInterval(() => {
  if (Math.abs(ctx.ship.spawned.body.angvel()) <= target) {
    console.log('90% decay:', (performance.now() - t0) / 1000, 's')
    clearInterval(id)
  }
}, 30)
```

If over 0.5s: raise `angular_damping` (start at 5; try 6, 7).

- [ ] **Step 5: Verify T4 (drift preservation)**

Reach top speed, release W. Watch HUD speed for 5 seconds. Should remain at or near `max_speed` value. If it drops noticeably, `linear_damping` is non-zero (verify YAML and config loader).

- [ ] **Step 6: Tune feel multipliers (subjective)**

While playing, judge:
- **Camera follow:** does the ship feel pinned to the cursor (raise `Camera.smoothing` constant in `src/game/camera.ts`) or does it feel like the camera is dragging behind (lower it)? Default 8 should be close.
- **Camera shake:** does ramming an asteroid feel impactful (correct) or jarring (lower the `/ 500` divisor in `main.ts` COLLISION handler) or weak (raise it)? Default `/ 500` should be close.
- **Thruster glow size:** is the orange ellipse readable? Adjust `12 * zoom, 20 * zoom` ellipse args in `body-renderer.ts` if needed.

If you change camera or shake constants, update them in their source files and add a note in the commit message.

- [ ] **Step 7: Remove debug aids and commit**

Remove the `(window as any).ctx = ctx` debug line from `src/main.ts` if added.

Run: `npx tsc --noEmit && npx vitest run`

Expected: no errors; tests pass.

```bash
git add public/assets/config/gameplay.yaml
# also include camera.ts / main.ts / body-renderer.ts if any feel constants were tuned
git commit -m "$(cat <<'EOF'
chore: empirical tuning pass

Adjusted thrust_strength and rotation_rate to hit feel targets:
T1 (time to top speed): <X>s, T2 (360 deg rotation): <Y>s,
T3 (rotation stop 90 percent): <Z>s, T4 (drift): preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Replace X, Y, Z with your measured values.

---

## Self-Review Checklist (run before declaring plan complete)

- [ ] Every task in the spec's Module Map has a corresponding Task in this plan.
- [ ] No "TBD", "TODO", "implement later", "fill in details" anywhere.
- [ ] Every code step shows actual code, not a description.
- [ ] Every test step shows the actual assertions.
- [ ] Type signatures match across tasks: `Ship` constructor in Task 7 takes the full `GameplayShipConfig` from Task 1; `MainMenu`/`PauseMenu`/`GameHUD` constructors in Tasks 10-12 match the call sites in Task 14; `BodyRenderer.renderBodies` signature in Task 9 matches the call in Task 14; `spawnComposite` opts in Task 5 match the calls in Tasks 8 and 13.
- [ ] No em-dashes in this document (soul check blocks them).

## Done When

All 15 tasks are committed, the manual smoke checklist in Task 14 Step 3 passes, and the four tuning targets in Task 15 are met. At that point the game is "playable" in the spec sense: a player can boot, navigate a title, fly with weighty-but-tight controls, hear collision and ambient audio, pause cleanly, and return to title.
