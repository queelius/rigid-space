# Wire main.ts to Ported Code: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the proof-of-concept main.ts with a modular game skeleton using GridComposite, spawnComposite, InputManager, ScreenStack, EventBus, config loading, and a fixed-timestep game loop.

**Architecture:** Thin main.ts (~80 lines) composes focused modules: BodyRegistry (tagged body storage), gravity (pure function), Ship (wraps SpawnedBody), GameLoop (fixed timestep), BodyRenderer (interface + immediate-mode impl), GameContext (plain interface). All bodies are GridComposite-backed SpawnedBodies managed through a tagged registry.

**Tech Stack:** TypeScript, Rapier2D-compat (WASM), PixiJS v8, Vite, vitest, js-yaml

**Spec:** `docs/superpowers/specs/2026-03-19-wire-main-to-ported-code-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/engine/body-registry.ts` | Create | Tagged SpawnedBody registry with auto-ID |
| `src/engine/body-registry.test.ts` | Create | Unit tests for registry |
| `src/engine/gravity.ts` | Create | Brute-force N-body gravity |
| `src/engine/gravity.test.ts` | Create | Integration tests (Rapier) |
| `src/engine/grid-composite.test.ts` | Create | Unit tests for existing GridComposite |
| `src/engine/rigid-spawn.test.ts` | Create | Integration tests for existing spawnComposite |
| `src/engine/events.test.ts` | Create | Unit tests for existing EventBus |
| `src/game/ship.ts` | Create | Ship class wrapping SpawnedBody |
| `src/game/ship.test.ts` | Create | Integration tests (Rapier) |
| `src/game/game-context.ts` | Rewrite | Rapier-native GameContext interface |
| `src/game/game-loop.ts` | Create | Fixed-timestep loop with accumulator |
| `src/game/game-loop.test.ts` | Create | Unit tests with mocked timing |
| `src/render/body-renderer.ts` | Create | BodyRenderer interface + GraphicsBodyRenderer |
| `src/main.ts` | Rewrite | Thin composition root |
| `src/game/hud-data.ts` | Delete | Old particle engine refs |
| `vitest.config.ts` | Modify | Add `src/**/*.test.ts` to include |
| `package.json` | Modify | Add js-yaml deps |

---

### Task 1: Project Setup

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Delete: `src/game/hud-data.ts`

- [ ] **Step 1: Install js-yaml dependencies**

```bash
npm install js-yaml && npm install -D @types/js-yaml
```

- [ ] **Step 2: Update vitest.config.ts to include src/ tests**

```typescript
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Delete hud-data.ts**

```bash
rm src/game/hud-data.ts
```

- [ ] **Step 4: Verify setup**

Run: `npx vitest run`
Expected: No test files found (that's fine, we haven't written any yet). No crash.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git rm src/game/hud-data.ts
git commit -m "chore: install js-yaml, update vitest config, remove hud-data.ts"
```

---

### Task 2: BodyRegistry

**Files:**
- Create: `src/engine/body-registry.ts`
- Create: `src/engine/body-registry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/engine/body-registry.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { BodyRegistry } from './body-registry'
import { GridComposite } from './grid-composite'
import { Type } from './types'
import { spawnComposite } from './rigid-spawn'

describe('BodyRegistry', () => {
  let registry: BodyRegistry
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
    registry = new BodyRegistry()
  })

  function spawn(type = Type.ROCK): ReturnType<typeof spawnComposite> {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, type)
    return spawnComposite(world, grid, 0, 0, 0, 0, 10)
  }

  it('add returns auto-incrementing IDs', () => {
    const id1 = registry.add('star', spawn())
    const id2 = registry.add('asteroid', spawn())
    expect(id2).toBe(id1 + 1)
  })

  it('get retrieves by ID', () => {
    const spawned = spawn()
    const id = registry.add('ship', spawned)
    const entry = registry.get(id)
    expect(entry).toBeDefined()
    expect(entry!.tag).toBe('ship')
    expect(entry!.spawned).toBe(spawned)
  })

  it('get returns undefined for missing ID', () => {
    expect(registry.get(999)).toBeUndefined()
  })

  it('getByTag returns all entries with that tag', () => {
    registry.add('asteroid', spawn())
    registry.add('ship', spawn())
    registry.add('asteroid', spawn())
    const asteroids = registry.getByTag('asteroid')
    expect(asteroids).toHaveLength(2)
    expect(asteroids.every(e => e.tag === 'asteroid')).toBe(true)
  })

  it('getByTag returns empty array for unknown tag', () => {
    expect(registry.getByTag('nothing')).toEqual([])
  })

  it('firstByTag returns first match', () => {
    registry.add('star', spawn())
    const entry = registry.firstByTag('star')
    expect(entry).toBeDefined()
    expect(entry!.tag).toBe('star')
  })

  it('firstByTag returns undefined when no match', () => {
    expect(registry.firstByTag('star')).toBeUndefined()
  })

  it('all returns every entry', () => {
    registry.add('star', spawn())
    registry.add('ship', spawn())
    registry.add('asteroid', spawn())
    expect(registry.all()).toHaveLength(3)
  })

  it('remove cleans up Rapier body and deletes entry', () => {
    const id = registry.add('asteroid', spawn())
    const removed = registry.remove(world, id)
    expect(removed).toBe(true)
    expect(registry.get(id)).toBeUndefined()
    expect(registry.all()).toHaveLength(0)
  })

  it('remove returns false for missing ID', () => {
    expect(registry.remove(world, 999)).toBe(false)
  })

  it('is iterable', () => {
    registry.add('a', spawn())
    registry.add('b', spawn())
    const tags = [...registry].map(e => e.tag)
    expect(tags).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/body-registry.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement BodyRegistry**

Create `src/engine/body-registry.ts`:

```typescript
import RAPIER from '@dimforge/rapier2d-compat'
import type { SpawnedBody } from './rigid-spawn'

export interface RegistryEntry {
  id: number
  tag: string
  spawned: SpawnedBody
}

export class BodyRegistry {
  private entries = new Map<number, RegistryEntry>()
  private nextId = 0

  add(tag: string, spawned: SpawnedBody): number {
    const id = this.nextId++
    this.entries.set(id, { id, tag, spawned })
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
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/body-registry.ts src/engine/body-registry.test.ts
git commit -m "feat: add BodyRegistry with tagged auto-ID storage"
```

---

### Task 3: Gravity Module

**Files:**
- Create: `src/engine/gravity.ts`
- Create: `src/engine/gravity.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/engine/gravity.test.ts`. These are integration tests that need Rapier.

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { BodyRegistry } from './body-registry'
import { applyGravity } from './gravity'
import { GridComposite } from './grid-composite'
import { Type } from './types'
import { spawnComposite } from './rigid-spawn'

describe('applyGravity', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  function makeGrid1x1(type: Type): GridComposite {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, type)
    return grid
  }

  it('attracts dynamic body toward attractor-tagged body', () => {
    const registry = new BodyRegistry()
    const starGrid = makeGrid1x1(Type.EXOTIC)
    const starSpawned = spawnComposite(world, starGrid, 0, 0, 0, 0, 10, true)
    registry.add('star', starSpawned)

    const rockGrid = makeGrid1x1(Type.ROCK)
    const rockSpawned = spawnComposite(world, rockGrid, 100, 0, 0, 0, 10)
    registry.add('asteroid', rockSpawned)

    applyGravity(registry, 50000, 'star')
    world.step()

    // Rock should have moved toward the star (negative x velocity)
    const vel = rockSpawned.body.linvel()
    expect(vel.x).toBeLessThan(0)
  })

  it('does not move kinematic bodies', () => {
    const registry = new BodyRegistry()
    const starGrid = makeGrid1x1(Type.EXOTIC)
    const starSpawned = spawnComposite(world, starGrid, 0, 0, 0, 0, 10, true)
    registry.add('star', starSpawned)

    const rockGrid = makeGrid1x1(Type.ROCK)
    registry.add('asteroid', spawnComposite(world, rockGrid, 100, 0, 0, 0, 10))

    applyGravity(registry, 50000, 'star')
    world.step()

    // Star (kinematic) should not have moved
    const starPos = starSpawned.body.translation()
    expect(starPos.x).toBe(0)
    expect(starPos.y).toBe(0)
  })

  it('applies stronger force at closer distance', () => {
    const registry = new BodyRegistry()
    const starGrid = makeGrid1x1(Type.EXOTIC)
    registry.add('star', spawnComposite(world, starGrid, 0, 0, 0, 0, 10, true))

    const nearGrid = makeGrid1x1(Type.ROCK)
    const nearSpawned = spawnComposite(world, nearGrid, 50, 0, 0, 0, 10)
    registry.add('asteroid', nearSpawned)

    const farGrid = makeGrid1x1(Type.ROCK)
    const farSpawned = spawnComposite(world, farGrid, 200, 0, 0, 0, 10)
    registry.add('asteroid', farSpawned)

    applyGravity(registry, 50000, 'star')
    world.step()

    const nearVel = Math.abs(nearSpawned.body.linvel().x)
    const farVel = Math.abs(farSpawned.body.linvel().x)
    expect(nearVel).toBeGreaterThan(farVel)
  })

  it('skips bodies closer than minimum distance', () => {
    const registry = new BodyRegistry()
    const starGrid = makeGrid1x1(Type.EXOTIC)
    registry.add('star', spawnComposite(world, starGrid, 0, 0, 0, 0, 10, true))

    const rockGrid = makeGrid1x1(Type.ROCK)
    const rockSpawned = spawnComposite(world, rockGrid, 1, 0, 0, 0, 10)
    registry.add('asteroid', rockSpawned)

    // Should not throw or produce NaN
    applyGravity(registry, 50000, 'star')
    world.step()

    const vel = rockSpawned.body.linvel()
    expect(Number.isFinite(vel.x)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/gravity.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement gravity**

Create `src/engine/gravity.ts`:

```typescript
import RAPIER from '@dimforge/rapier2d-compat'
import type { BodyRegistry } from './body-registry'

const MIN_DIST = 5

export function applyGravity(
  registry: BodyRegistry,
  G: number,
  attractorTag?: string,
): void {
  if (attractorTag) {
    applyTaggedGravity(registry, G, attractorTag)
  } else {
    applyPairwiseGravity(registry, G)
  }
}

function applyTaggedGravity(
  registry: BodyRegistry,
  G: number,
  attractorTag: string,
): void {
  const attractors = registry.getByTag(attractorTag)
  if (attractors.length === 0) return

  for (const entry of registry) {
    if (entry.tag === attractorTag) continue
    if (entry.spawned.body.isKinematic()) continue

    const body = entry.spawned.body
    const pos = body.translation()

    for (const attractor of attractors) {
      const aPos = attractor.spawned.body.translation()
      const dx = aPos.x - pos.x
      const dy = aPos.y - pos.y
      const distSq = dx * dx + dy * dy
      const dist = Math.sqrt(distSq)
      if (dist < MIN_DIST) continue

      // Attractor mass omitted intentionally: G constant is tuned to include it.
      // Matches the PoC formula. Full pairwise mode uses both masses.
      const force = G * body.mass() / distSq
      body.addForce(
        new RAPIER.Vector2(force * dx / dist, force * dy / dist),
        true,
      )
    }
  }
}

function applyPairwiseGravity(
  registry: BodyRegistry,
  G: number,
): void {
  const entries = registry.all()
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i].spawned.body
    const aPos = a.translation()
    const aKinematic = a.isKinematic()

    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j].spawned.body
      const bPos = b.translation()
      const bKinematic = b.isKinematic()

      if (aKinematic && bKinematic) continue

      const dx = bPos.x - aPos.x
      const dy = bPos.y - aPos.y
      const distSq = dx * dx + dy * dy
      const dist = Math.sqrt(distSq)
      if (dist < MIN_DIST) continue

      const massA = a.mass()
      const massB = b.mass()
      const forceMag = G * massA * massB / distSq
      const fx = forceMag * dx / dist
      const fy = forceMag * dy / dist

      if (!aKinematic) {
        a.addForce(new RAPIER.Vector2(fx, fy), true)
      }
      if (!bKinematic) {
        b.addForce(new RAPIER.Vector2(-fx, -fy), true)
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/gravity.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/gravity.ts src/engine/gravity.test.ts
git commit -m "feat: add gravity module with tagged and pairwise modes"
```

---

### Task 4: GameLoop

> **Spec deviation:** API changed from spec's `startGameLoop` to `createGameLoop` returning `{ tick, start, stop }`. The `tick(dt)` method enables unit tests without RAF mocking.

**Files:**
- Create: `src/game/game-loop.ts`
- Create: `src/game/game-loop.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/game-loop.test.ts`. These use a mock timing function (no DOM needed).

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createGameLoop } from './game-loop'

describe('createGameLoop', () => {
  it('calls fixedUpdate the correct number of times for elapsed time', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016 // ~60fps

    const loop = createGameLoop(timestep, { fixedUpdate, render })

    // Simulate 3 timesteps of elapsed time
    loop.tick(timestep * 3)

    expect(fixedUpdate).toHaveBeenCalledTimes(3)
    expect(fixedUpdate).toHaveBeenCalledWith(timestep)
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('accumulates fractional time across ticks', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })

    // Half a timestep: no physics update yet
    loop.tick(timestep * 0.5)
    expect(fixedUpdate).toHaveBeenCalledTimes(0)

    // Another half: now we have one full timestep
    loop.tick(timestep * 0.5)
    expect(fixedUpdate).toHaveBeenCalledTimes(1)
  })

  it('caps accumulator to prevent spiral of death', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })

    // Simulate a huge time jump (e.g., tab was backgrounded)
    loop.tick(10.0) // 10 seconds
    // Should cap at 5 * timestep = 0.08s = 5 physics steps max
    expect(fixedUpdate).toHaveBeenCalledTimes(5)
  })

  it('render receives interpolation between 0 and 1', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })

    // 1.5 timesteps: 1 physics step, 0.5 leftover
    loop.tick(timestep * 1.5)

    expect(render).toHaveBeenCalledTimes(1)
    const interpolation = render.mock.calls[0][0]
    expect(interpolation).toBeGreaterThan(0)
    expect(interpolation).toBeLessThan(1)
  })

  it('always calls render even with zero physics steps', () => {
    const fixedUpdate = vi.fn()
    const render = vi.fn()
    const timestep = 0.016

    const loop = createGameLoop(timestep, { fixedUpdate, render })
    loop.tick(timestep * 0.1) // tiny time, no physics step

    expect(fixedUpdate).toHaveBeenCalledTimes(0)
    expect(render).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/game-loop.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement GameLoop**

Create `src/game/game-loop.ts`:

```typescript
export interface GameLoopCallbacks {
  fixedUpdate(dt: number): void
  render(interpolation: number): void
}

export interface GameLoop {
  /** Manually advance by dt seconds (for testing) */
  tick(dt: number): void
  /** Start the RAF-driven loop */
  start(): void
  /** Stop the RAF-driven loop */
  stop(): void
}

export function createGameLoop(
  timestep: number,
  callbacks: GameLoopCallbacks,
): GameLoop {
  let accumulator = 0
  let rafId = 0
  let lastTime = 0
  const maxAccumulator = timestep * 5

  function tick(dt: number): void {
    accumulator += dt
    if (accumulator > maxAccumulator) {
      accumulator = maxAccumulator
    }

    while (accumulator >= timestep) {
      callbacks.fixedUpdate(timestep)
      accumulator -= timestep
    }

    callbacks.render(accumulator / timestep)
  }

  function frame(now: number): void {
    const dt = lastTime === 0 ? timestep : (now - lastTime) / 1000
    lastTime = now
    tick(dt)
    rafId = requestAnimationFrame(frame)
  }

  return {
    tick,
    start() {
      lastTime = 0
      rafId = requestAnimationFrame(frame)
    },
    stop() {
      cancelAnimationFrame(rafId)
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/game-loop.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/game-loop.ts src/game/game-loop.test.ts
git commit -m "feat: add fixed-timestep game loop with accumulator"
```

---

### Task 5: Ship

**Files:**
- Create: `src/game/ship.ts`
- Create: `src/game/ship.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/game/ship.test.ts`. Integration tests using Rapier.

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { Ship } from './ship'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'
import { spawnComposite } from '../engine/rigid-spawn'
import { InputManager } from './input'

describe('Ship', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  function makeShipGrid(): GridComposite {
    const grid = new GridComposite(3, 5)
    grid.set(1, 4, Type.COCKPIT)       // nose
    grid.set(0, 2, Type.THRUSTER)      // left engine
    grid.set(2, 2, Type.THRUSTER)      // right engine
    grid.set(1, 2, Type.REACTOR)       // center
    grid.set(1, 1, Type.FUEL)          // fuel
    grid.set(1, 0, Type.FUEL)          // fuel
    return grid
  }

  function makeShip(): Ship {
    const grid = makeShipGrid()
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    return new Ship(0, spawned, { thrust_strength: 500, rotation_rate: 12, cannon: { mass: 1, speed: 400 } })
  }

  it('reads position from Rapier body', () => {
    const ship = makeShip()
    const pos = ship.position()
    expect(pos.x).toBe(0)
    expect(pos.y).toBe(0)
  })

  it('speed is zero when stationary', () => {
    const ship = makeShip()
    expect(ship.speed()).toBe(0)
  })

  it('applyControls applies forward thrust when thrust_forward is held', () => {
    const ship = makeShip()
    const input = new InputManager()
    // Manually set up the action mapping and simulate key held
    input['actionToKey'].set('thrust_forward', 'w')
    input['keyHeld']['w'] = true

    ship.applyControls(input)
    world.step()

    // Ship should have gained velocity in the forward direction (+Y when rotation=0)
    const vel = ship.velocity()
    expect(vel.y).toBeGreaterThan(0)
  })

  it('applyControls applies torque when rotate_left is held', () => {
    const ship = makeShip()
    const input = new InputManager()
    input['actionToKey'].set('rotate_left', 'a')
    input['keyHeld']['a'] = true

    ship.applyControls(input)
    world.step()

    // Body should have angular velocity (negative torque = counterclockwise in Rapier's convention)
    // The exact sign depends on Rapier's torque convention
    const angvel = ship.spawned.body.angvel()
    expect(angvel).not.toBe(0)
  })

  it('rotation returns body angle', () => {
    const ship = makeShip()
    expect(ship.rotation()).toBe(0) // starts at zero
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/ship.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement Ship**

Create `src/game/ship.ts`:

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

  constructor(registryId: number, spawned: SpawnedBody, config: GameplayShipConfig) {
    this.registryId = registryId
    this.spawned = spawned
    this.thrustStrength = config.thrust_strength
    this.rotationRate = config.rotation_rate
  }

  applyControls(input: InputManager): void {
    const body = this.spawned.body
    const angle = body.rotation()
    // Forward direction: +Y in local space rotated by body angle
    const fx = -Math.sin(angle)
    const fy = Math.cos(angle)

    if (input.isAction('thrust_forward')) {
      body.addForce(
        new RAPIER.Vector2(fx * this.thrustStrength, fy * this.thrustStrength),
        true,
      )
    }
    if (input.isAction('thrust_backward')) {
      body.addForce(
        new RAPIER.Vector2(-fx * this.thrustStrength * 0.5, -fy * this.thrustStrength * 0.5),
        true,
      )
    }
    if (input.isAction('rotate_left')) {
      body.addTorque(-this.rotationRate, true)
    }
    if (input.isAction('rotate_right')) {
      body.addTorque(this.rotationRate, true)
    }
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/ship.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/ship.ts src/game/ship.test.ts
git commit -m "feat: add Ship class wrapping SpawnedBody with config-driven controls"
```

---

### Task 6: GameContext Interface

**Files:**
- Rewrite: `src/game/game-context.ts`

- [ ] **Step 1: Rewrite GameContext**

Replace `src/game/game-context.ts` with the Rapier-native version:

```typescript
import type RAPIER from '@dimforge/rapier2d-compat'
import type { BodyRegistry } from '../engine/body-registry'
import type { Ship } from './ship'
import type { InputManager } from './input'
import type { ScreenStack } from './screen-stack'
import type { EventBus } from '../engine/events'
import type { GameConfig } from '../config/loader'
import type { BodyRenderer } from '../render/body-renderer'

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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep game-context`
Expected: May show errors for game-context.ts (BodyRenderer not yet created). That's fine, resolves after Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/game/game-context.ts
git commit -m "feat: rewrite GameContext as Rapier-native interface"
```

---

### Task 7: BodyRenderer

**Files:**
- Create: `src/render/body-renderer.ts`

- [ ] **Step 1: Create render directory and renderer**

```bash
mkdir -p src/render
```

Create `src/render/body-renderer.ts`:

```typescript
import { Graphics, Application } from 'pixi.js'
import type { BodyRegistry, RegistryEntry } from '../engine/body-registry'
import { typeProps } from '../engine/types'

export interface BodyRenderer {
  renderBodies(registry: BodyRegistry, camera: { x: number; y: number; zoom: number }): void
  onBodyAdded(entry: RegistryEntry): void
  onBodyRemoved(id: number): void
  resize(width: number, height: number): void
}

// Hardcoded type colors for immediate-mode rendering.
// These match the YAML config defaults. Config-driven colors come with Priority 2.
const TYPE_COLORS: number[] = [
  0x888888, // ROCK
  0xAAAAAA, // IRON
  0x333333, // CARBON
  0xFFAA00, // FUEL
  0xDD4444, // THRUSTER
  0x44DDFF, // CRYSTAL
  0xFF4444, // EXPLOSIVE
  0x4488FF, // WATER
  0xFFDD44, // EXOTIC
  0xFF8800, // EMITTER
  0x44FF44, // COCKPIT
  0x886644, // CARGO
  0x8888FF, // REACTOR
  0x220022, // BLACKHOLE
  0x664422, // SOIL
  0x22AA22, // PLANT
  0xCCEEFF, // ICE
  0xDDCC88, // SAND
  0xFF4400, // LAVA
  0xAA44FF, // DRIVECORE
]

export class GraphicsBodyRenderer implements BodyRenderer {
  private gfx: Graphics
  private app: Application

  constructor(app: Application) {
    this.app = app
    this.gfx = new Graphics()
    app.stage.addChild(this.gfx)
  }

  renderBodies(registry: BodyRegistry, camera: { x: number; y: number; zoom: number }): void {
    const w = this.app.screen.width
    const h = this.app.screen.height
    const { x: camX, y: camY, zoom } = camera

    this.gfx.clear()

    for (const entry of registry) {
      const body = entry.spawned.body
      const pos = body.translation()
      const rot = body.rotation()
      const cos = Math.cos(-rot)
      const sin = Math.sin(-rot)
      const grid = entry.spawned.grid
      const cellScale = entry.spawned.cellScale

      // Star: render as circle.
      // Uses cellScale as visual radius (star is spawned with cellScale=50 matching ball(50) collider).
      // This coupling is intentional for the PoC; Priority 2 renderer will use proper radius metadata.
      if (entry.tag === 'star') {
        const sx = w / 2 + (pos.x - camX) * zoom
        const sy = h / 2 - (pos.y - camY) * zoom
        const radius = cellScale * zoom
        this.gfx.circle(sx, sy, radius).fill(0xFFDD44)
        continue
      }

      // All other bodies: render each grid cell as a colored rectangle
      const halfCell = (cellScale / 2) * zoom

      // Compute COM offset (same formula as rigid-spawn.ts)
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

          // Cell local position relative to body center (same as rigid-spawn.ts)
          const localX = ((gx - grid.width / 2 + 0.5) * cellScale - comX) * zoom
          const localY = ((gy - grid.height / 2 + 0.5) * cellScale - comY) * zoom

          // Rotate local position by body rotation
          const worldX = localX * cos - localY * sin
          const worldY = localX * sin + localY * cos

          // Screen position
          const sx = w / 2 + (pos.x - camX) * zoom + worldX
          const sy = h / 2 - (pos.y - camY) * zoom - worldY

          // Draw rotated cell (simplified: axis-aligned rect at rotated center)
          this.gfx.rect(sx - halfCell, sy - halfCell, halfCell * 2, halfCell * 2)
            .fill(color)
        }
      }
    }
  }

  onBodyAdded(_entry: RegistryEntry): void {
    // No-op for immediate-mode. Priority 2's SpriteBodyRenderer uses this.
  }

  onBodyRemoved(_id: number): void {
    // No-op for immediate-mode. Priority 2's SpriteBodyRenderer uses this.
  }

  resize(_width: number, _height: number): void {
    // PixiJS handles canvas resize via app.resizeTo
  }
}
```

- [ ] **Step 2: Verify GameContext now compiles**

Run: `npx tsc --noEmit 2>&1 | grep game-context`
Expected: No errors mentioning game-context.ts or body-renderer.ts. Errors from unconnected ported files (stargate.ts, npc.ts, etc.) are expected and can be ignored.

- [ ] **Step 3: Commit**

```bash
git add src/render/body-renderer.ts
git commit -m "feat: add BodyRenderer interface and GraphicsBodyRenderer"
```

---

### Task 8: Rewrite main.ts

**Files:**
- Rewrite: `src/main.ts`

- [ ] **Step 1: Rewrite main.ts as composition root**

Replace `src/main.ts` entirely:

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
import type { GameContext } from './game/game-context'

async function main() {
  // 1. Init Rapier WASM
  await RAPIER.init()

  // 2. Load config, apply type properties
  const config = await loadConfig()
  applyTypeConfig(config.types)

  // 3. Init PixiJS
  const app = new Application()
  await app.init({
    canvas: document.getElementById('game') as HTMLCanvasElement,
    resizeTo: window,
    backgroundColor: 0x050510,
    antialias: true,
    preference: 'webgl',
  })

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

  // 5. Spawn star (1x1 EXOTIC, kinematic, ball collider)
  const starGrid = new GridComposite(1, 1)
  starGrid.set(0, 0, Type.EXOTIC)
  const starSpawned = spawnComposite(rapierWorld, starGrid, 0, 0, 0, 0, 50, true)
  // Replace cuboid with ball collider for circular star
  const starCuboid = starSpawned.colliderMap.get('0,0')!
  rapierWorld.removeCollider(starCuboid, false)
  rapierWorld.createCollider(
    RAPIER.ColliderDesc.ball(50).setDensity(100),
    starSpawned.body,
  )
  starSpawned.colliderMap.delete('0,0')
  registry.add('star', starSpawned)

  // 6. Spawn ship (3x5 grid)
  const shipGrid = new GridComposite(3, 5)
  shipGrid.set(1, 4, Type.COCKPIT)   // nose
  shipGrid.set(0, 2, Type.THRUSTER)  // left engine
  shipGrid.set(2, 2, Type.THRUSTER)  // right engine
  shipGrid.set(1, 2, Type.REACTOR)   // center
  shipGrid.set(1, 1, Type.FUEL)
  shipGrid.set(1, 0, Type.FUEL)
  const shipSpawned = spawnComposite(rapierWorld, shipGrid, 300, 0, 0, 30, 10)
  const shipId = registry.add('ship', shipSpawned)
  const ship = new Ship(shipId, shipSpawned, config.gameplay.ship)

  // 7. Spawn asteroids
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = 150 + Math.random() * 400
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    const v = 20 + Math.random() * 15
    const vx = -Math.sin(angle) * v
    const vy = Math.cos(angle) * v
    const size = 1 + Math.floor(Math.random() * 3) // 1x1 to 3x3

    const grid = new GridComposite(size, size)
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        if (Math.random() < 0.7) {
          grid.set(gx, gy, Math.random() < 0.2 ? Type.IRON : Type.ROCK)
        }
      }
    }
    const spawned = spawnComposite(rapierWorld, grid, x, y, vx, vy, 8)
    registry.add('asteroid', spawned)
  }

  // 8. Build context
  const ctx: GameContext = {
    rapierWorld, registry, ship, input, screenStack, events, config, renderer,
    camera: { x: 0, y: 0, zoom: 1 },
  }

  // 9. HUD setup
  const hudCanvas = document.getElementById('hud') as HTMLCanvasElement

  function renderHUD(): void {
    const w = app.screen.width
    const h = app.screen.height
    if (hudCanvas.width !== w || hudCanvas.height !== h) {
      hudCanvas.width = w
      hudCanvas.height = h
    }
    const hctx = hudCanvas.getContext('2d')!
    hctx.clearRect(0, 0, w, h)
    hctx.fillStyle = '#aaa'
    hctx.font = '14px monospace'
    hctx.fillText('Rigid Space  |  Rapier2D WASM', 10, 20)
    hctx.fillText(`Bodies: ${registry.all().length}  |  WASD: fly`, 10, 40)
    hctx.fillText(`Speed: ${ship.speed().toFixed(0)}`, 10, 60)
  }

  // 10. Start game loop
  const loop = createGameLoop(config.gameplay.physics.timestep, {
    fixedUpdate(_dt) {
      if (!screenStack.paused) {
        ship.applyControls(input)
        applyGravity(registry, 50000, 'star')
        rapierWorld.step()
      }
      screenStack.update(_dt)
    },
    render(_interpolation) {
      ctx.camera.x = ship.position().x
      ctx.camera.y = ship.position().y
      renderer.renderBodies(registry, ctx.camera)
      renderHUD()
    },
  })

  loop.start()
}

main()
```

- [ ] **Step 2: Verify it compiles**

> Note: The `RAPIER.init({})` fix from the spec is applied here (now `RAPIER.init()` with no arguments).

Run: `npx tsc --noEmit 2>&1 | grep 'main.ts'`
Expected: No errors mentioning main.ts. Errors from unconnected ported files are expected.

- [ ] **Step 3: Manual test in browser**

Run: `npx vite`
Open `http://localhost:5173/` in browser. Verify:
- Yellow circle star at center
- Ship (colored grid cells) orbiting or near star
- Asteroids (colored grid cells) orbiting
- WASD controls work (ship thrusts/rotates)
- Camera follows ship
- HUD shows body count and speed
- No console errors

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: rewrite main.ts as thin composition root using ported modules"
```

---

### Task 9: Tests for Existing Modules

**Files:**
- Create: `src/engine/grid-composite.test.ts`
- Create: `src/engine/events.test.ts`
- Create: `src/engine/rigid-spawn.test.ts`

- [ ] **Step 1: Write GridComposite tests**

Create `src/engine/grid-composite.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { GridComposite, Direction } from './grid-composite'
import { Type } from './types'

describe('GridComposite', () => {
  it('set and get a cell', () => {
    const grid = new GridComposite(3, 3)
    grid.set(1, 1, Type.ROCK)
    const cell = grid.get(1, 1)
    expect(cell).not.toBeNull()
    expect(cell!.type).toBe(Type.ROCK)
    expect(cell!.facing).toBe(Direction.UP)
  })

  it('set with facing', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.EMITTER, Direction.RIGHT)
    expect(grid.get(0, 0)!.facing).toBe(Direction.RIGHT)
  })

  it('get returns null for empty cell', () => {
    const grid = new GridComposite(3, 3)
    expect(grid.get(0, 0)).toBeNull()
  })

  it('get returns null for out-of-bounds', () => {
    const grid = new GridComposite(3, 3)
    expect(grid.get(-1, 0)).toBeNull()
    expect(grid.get(3, 0)).toBeNull()
    expect(grid.get(0, -1)).toBeNull()
    expect(grid.get(0, 3)).toBeNull()
  })

  it('clear removes a cell', () => {
    const grid = new GridComposite(3, 3)
    grid.set(1, 1, Type.ROCK)
    grid.clear(1, 1)
    expect(grid.get(1, 1)).toBeNull()
  })

  it('countType counts matching cells', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.FUEL)
    grid.set(1, 0, Type.FUEL)
    grid.set(2, 0, Type.ROCK)
    expect(grid.countType(Type.FUEL)).toBe(2)
    expect(grid.countType(Type.ROCK)).toBe(1)
    expect(grid.countType(Type.IRON)).toBe(0)
  })

  it('edgeMask returns correct bits for exposed edges', () => {
    const grid = new GridComposite(3, 3)
    grid.set(1, 1, Type.ROCK) // center, all edges exposed
    const mask = grid.edgeMask(1, 1)
    expect(mask).toBe(0b1111) // all 4 edges exposed
  })

  it('edgeMask returns 0 for empty cell', () => {
    const grid = new GridComposite(3, 3)
    expect(grid.edgeMask(1, 1)).toBe(0)
  })

  it('edgeMask hides edges adjacent to filled cells', () => {
    const grid = new GridComposite(3, 3)
    grid.set(1, 1, Type.ROCK)
    grid.set(2, 1, Type.ROCK) // right neighbor
    const mask = grid.edgeMask(1, 1)
    // bit1 (right) should be 0, others should be 1
    expect(mask & 2).toBe(0)  // right edge not exposed
    expect(mask & 1).toBe(1)  // top edge exposed
    expect(mask & 4).toBe(4)  // bottom edge exposed
    expect(mask & 8).toBe(8)  // left edge exposed
  })

  it('serialization round-trip preserves data', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.COCKPIT, Direction.DOWN)
    grid.set(2, 2, Type.FUEL)
    const json = grid.toJSON()
    const restored = GridComposite.fromJSON(json)
    expect(restored.width).toBe(3)
    expect(restored.height).toBe(3)
    expect(restored.get(0, 0)!.type).toBe(Type.COCKPIT)
    expect(restored.get(0, 0)!.facing).toBe(Direction.DOWN)
    expect(restored.get(2, 2)!.type).toBe(Type.FUEL)
    expect(restored.get(1, 1)).toBeNull()
  })

  it('hasFuelNeighbor detects 8-connected fuel cells', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.FUEL)
    grid.set(1, 1, Type.THRUSTER)
    expect(grid.hasFuelNeighbor(1, 1)).toBe(true)
    expect(grid.hasFuelNeighbor(2, 2)).toBe(false)
  })
})
```

- [ ] **Step 2: Write EventBus tests**

Create `src/engine/events.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from './events'

describe('EventBus', () => {
  it('emits to registered handler', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('collision', handler)
    bus.emit({ type: 'collision', x: 10, y: 20 })
    expect(handler).toHaveBeenCalledWith({ type: 'collision', x: 10, y: 20 })
  })

  it('does not call handlers for different event types', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('collision', handler)
    bus.emit({ type: 'explosion', x: 0, y: 0 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('supports multiple handlers for same event', () => {
    const bus = new EventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('collision', h1)
    bus.on('collision', h2)
    bus.emit({ type: 'collision', x: 0, y: 0 })
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('off removes a handler', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('collision', handler)
    bus.off('collision', handler)
    bus.emit({ type: 'collision', x: 0, y: 0 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('clear removes all handlers', () => {
    const bus = new EventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('collision', h1)
    bus.on('explosion', h2)
    bus.clear()
    bus.emit({ type: 'collision', x: 0, y: 0 })
    bus.emit({ type: 'explosion', x: 0, y: 0 })
    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Write spawnComposite tests**

Create `src/engine/rigid-spawn.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import RAPIER from '@dimforge/rapier2d-compat'
import { spawnComposite, removeCell } from './rigid-spawn'
import { GridComposite } from './grid-composite'
import { Type } from './types'

describe('spawnComposite', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  it('creates one collider per filled cell', () => {
    const grid = new GridComposite(3, 3)
    grid.set(0, 0, Type.ROCK)
    grid.set(1, 1, Type.IRON)
    grid.set(2, 2, Type.FUEL)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    expect(spawned.colliderMap.size).toBe(3)
  })

  it('positions body at specified coordinates', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 100, 200, 0, 0, 10)
    const pos = spawned.body.translation()
    expect(pos.x).toBe(100)
    expect(pos.y).toBe(200)
  })

  it('applies initial velocity', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 5, 10, 10)
    const vel = spawned.body.linvel()
    expect(vel.x).toBe(5)
    expect(vel.y).toBe(10)
  })

  it('kinematic body is kinematic', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.EXOTIC)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10, true)
    expect(spawned.body.isKinematic()).toBe(true)
  })

  it('stores grid reference and cellScale', () => {
    const grid = new GridComposite(2, 2)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 15)
    expect(spawned.grid).toBe(grid)
    expect(spawned.cellScale).toBe(15)
  })

  it('computes totalMass from cell types', () => {
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.ROCK) // defaultMass = 6.0
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    expect(spawned.totalMass).toBe(6.0)
  })
})

describe('removeCell', () => {
  let world: RAPIER.World

  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    world = new RAPIER.World(new RAPIER.Vector2(0, 0))
  })

  it('removes a collider and clears the grid cell', () => {
    const grid = new GridComposite(2, 2)
    grid.set(0, 0, Type.ROCK)
    grid.set(1, 0, Type.IRON)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)

    const removed = removeCell(world, spawned, 0, 0)
    expect(removed).toBe(true)
    expect(spawned.colliderMap.has('0,0')).toBe(false)
    expect(grid.get(0, 0)).toBeNull()
    expect(spawned.colliderMap.size).toBe(1) // 1,0 remains
  })

  it('returns false for empty cell', () => {
    const grid = new GridComposite(2, 2)
    grid.set(0, 0, Type.ROCK)
    const spawned = spawnComposite(world, grid, 0, 0, 0, 0, 10)
    expect(removeCell(world, spawned, 1, 1)).toBe(false)
  })
})
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS across all 7 test files.

- [ ] **Step 5: Commit**

```bash
git add src/engine/grid-composite.test.ts src/engine/events.test.ts src/engine/rigid-spawn.test.ts
git commit -m "test: add unit and integration tests for GridComposite, EventBus, spawnComposite"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass. Note the count.

- [ ] **Step 2: Type-check main.ts import graph**

Run: `npx tsc --noEmit 2>&1 | grep -E '(main|body-registry|gravity|game-loop|ship|game-context|body-renderer)\.ts'`
Expected: No errors from any of our new/rewritten files. Errors from unconnected ported files (stargate.ts, npc.ts, trade.ts, etc.) are expected and do not block.

- [ ] **Step 3: Verify dev server**

Run: `npx vite` and open in browser. Verify same behavior as Task 8 Step 3.

- [ ] **Step 4: Check test coverage**

Run: `npm install -D @vitest/coverage-v8 && npx vitest run --coverage`
Review coverage for new modules: body-registry, gravity, game-loop, ship.
All should have >80% line coverage.

- [ ] **Step 5: Final commit if any cleanup needed**

Only commit if there were fixes from verification. Otherwise, done.
