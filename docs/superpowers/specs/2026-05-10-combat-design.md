# Combat Loop: Design Spec

**Date:** 2026-05-10
**Scope:** Phase 5 of the post-foundation roadmap. Add cannon-fire-on-Space, projectile bodies, asteroid damage via cell removal, brief impact flashes, audio. Hooks into the existing collision-event pipeline.

## Summary

Add a new `Combat` class that owns projectiles, impact flashes, and the COLLISION → damage handler. `Ship` gains a cannon-cooldown timer. Pressing Space (or holding it) fires a projectile from the ship's nose at the configured cannon speed; cooldown gates rate of fire. The COLLISION event payload extends with body IDs (in addition to the existing tags) so the damage handler can call `removeCell` on the right body. When a body's last cell is removed, it's despawned entirely. The projectile is drawn as a procedural cyan-white radial-gradient sprite (special-cased in `SpriteBodyRenderer` like the star). On impact, a brief 150ms flash sprite is drawn inside the world container. Audio events `CANNON_FIRE` and `BOND_BREAK` are emitted; existing `SoundEngine.subscribeTo` routes them automatically.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Damage model | Remove one cell closest to impact point per hit | Predictable; learnable hit count to destroy a body |
| Cell-find rotation | Body rotation +rot (physics convention, NOT renderer's -rot) | Match Rapier's actual body frame |
| Cooldown | 0.3s between shots, configurable | Standard arcade rate-of-fire |
| Friendly fire | Projectiles do not damage the firing ship (skip 'ship' tag in handler) | Avoid grief from spamming Space near self |
| Auto-despawn | After 3s lifetime, configurable | Simple; predictable; no distance tracking needed |
| Empty body | Despawn entirely when last cell removed | No ghost bodies; matches Phase 1 spawn invariant |
| Impact flash | 150ms procedural radial sprite at impact point | High satisfaction per LOC; deferred particle systems |
| COLLISION ids | Extend payload with `ids: [number?, number?]` | Enables targeted damage; previous handlers already optional-chain `tags` so adding a sibling field is safe |
| Projectile render | Special-case 'projectile' tag in SpriteBodyRenderer | Matches existing 'star' pattern; no new Type enum |
| Projectile gravity | Don't skip; ~8 u/s per second of flight at r=500, negligible vs 400 u/s muzzle | One less branch in `applyTaggedGravity` |
| Combat ownership | Single `Combat` instance on GameContext | Lifetime spans whole session; despawnAll resets state |
| Effects layer | Graphics inside SpriteBodyRenderer's worldContainer | Auto-scales with zoom; auto-shakes with camera |

## Module Map

### Files to create

| File | Purpose | LOC |
|------|---------|-----|
| `src/game/combat.ts` | `Combat` class: spawnProjectile, tryFireFromShip, update, handleCollision, reset | ~200 |
| `src/game/combat.test.ts` | Tests for projectile spawn/lifetime, damage handler, friendly-fire skip, body-despawn-on-empty | ~180 |

### Files to modify

| File | Change |
|------|--------|
| `src/game/ship.ts` | Add `cannonCooldown`, `cannonCooldownDuration`. Methods: `tickCooldown(dt)`, `canFire()`, `markFired()`. Constructor reads `config.cannon.cooldown`. |
| `src/game/ship.test.ts` | 4 new tests for cooldown decrement, canFire/markFired, ready-after-cooldown. |
| `src/game/game-context.ts` | Add `combat: Combat` field. |
| `src/game/lifecycle.ts` | `despawnAll` calls `ctx.combat.reset()`. New helper: `despawnBody(ctx, id)` (small extraction so combat handler can use it without re-implementing the renderer-then-registry sequence). |
| `src/game/lifecycle.test.ts` | 1 new test: despawnAll calls combat.reset(). 1 test for despawnBody. |
| `src/game/collision-events.ts` | Extend COLLISION event with `ids: [entry1?.id, entry2?.id]`. |
| `src/game/collision-events.test.ts` | 1 new test verifies ids are present and correct. |
| `src/render/sprite-body-renderer.ts` | Special-case `entry.tag === 'projectile'` in `bakeSprite`: procedural cyan-white radial gradient (~16x16 px). Add `getWorldContainer(): Container` getter for Combat. |
| `src/render/texture-bake.ts` | Add `renderProjectileToCanvas(ctx, radius)` helper (mirrors `renderStarToCanvas`). |
| `src/render/texture-bake.test.ts` | 2 new tests for renderProjectileToCanvas. |
| `src/main.ts` | Construct `Combat` after renderer; pass world container. Add Combat to ctx. Wire `combat.subscribeTo(ctx)` on first user gesture (alongside soundEngine). In fixedUpdate: `ship.tickCooldown(dt)`, then if `fire_cannon` action held, `combat.tryFireFromShip(ctx)`. After existing physics, `combat.update(ctx, dt)`. |
| `public/assets/config/gameplay.yaml` | Add to `ship.cannon`: `cooldown: 0.3`, `lifetime: 3.0`, `energy: 1.0`. Existing `mass: 1.0`, `speed: 400` stay. |
| `src/config/loader.ts` | Extend `GameplayShipCannonConfig` with the three new fields. |

## API

```typescript
// src/game/combat.ts (new)

import { Container, Graphics } from 'pixi.js'
import RAPIER from '@dimforge/rapier2d-compat'
import type { GameContext } from './game-context'

export interface ImpactFlash {
  x: number       // world coordinates
  y: number
  spawnTime: number
  initialRadius: number
}

export class Combat {
  private flashGfx: Graphics
  private projectileSpawnTimes = new Map<number, number>()  // id -> spawnTime
  private flashes: ImpactFlash[] = []
  private currentTime = 0
  private subscribed = false

  constructor(worldContainer: Container) {
    this.flashGfx = new Graphics()
    worldContainer.addChild(this.flashGfx)
  }

  /** Subscribe to COLLISION events. Idempotent (matching SoundEngine pattern). */
  subscribeTo(ctx: GameContext): void

  /** Spawn a projectile from the ship if cooldown allows. Returns true if fired. */
  tryFireFromShip(ctx: GameContext): boolean

  /** Per-fixedUpdate tick: advance time, despawn expired projectiles, decay flashes, redraw flashGfx. */
  update(ctx: GameContext, dt: number): void

  /** Clear projectile state and active flashes. Called from despawnAll. */
  reset(): void
}
```

```typescript
// src/game/ship.ts (additions)

class Ship {
  // existing fields
  cannonCooldown = 0                  // seconds until ready
  cannonCooldownDuration: number      // from config.cannon.cooldown

  constructor(...) {
    // existing
    this.cannonCooldownDuration = config.cannon.cooldown
  }

  tickCooldown(dt: number): void {
    if (this.cannonCooldown > 0) {
      this.cannonCooldown = Math.max(0, this.cannonCooldown - dt)
    }
  }

  canFire(): boolean {
    return this.cannonCooldown <= 0
  }

  markFired(): void {
    this.cannonCooldown = this.cannonCooldownDuration
  }
}
```

```typescript
// src/game/lifecycle.ts (addition)

/** Despawn a body: notify renderer first, then clear from registry. */
export function despawnBody(ctx: GameContext, id: number): void
```

```typescript
// src/render/sprite-body-renderer.ts (additions)

class SpriteBodyRenderer {
  // ...
  getWorldContainer(): Container {
    return this.worldContainer
  }

  // bakeSprite: extend the tag dispatch:
  private bakeSprite(entry: RegistryEntry): Sprite {
    if (entry.tag === 'star') return this.bakeStarSprite(entry)
    if (entry.tag === 'projectile') return this.bakeProjectileSprite()
    return this.bakeGridSprite(entry)
  }
}
```

## Math

### Projectile spawn position + velocity

Ship at world `(sx, sy)`, rotation `r`. Visual nose direction in world: `(sin(r), cos(r))` (per the Phase 1 ship-direction fix).

Spawn position (just past the nose to avoid immediate collision):
```typescript
const NOSE_OFFSET = 30  // body-local +Y of cockpit is ~22; clear it plus margin
const fx = Math.sin(r)
const fy = Math.cos(r)
const spawnX = sx + fx * NOSE_OFFSET
const spawnY = sy + fy * NOSE_OFFSET
```

Velocity = ship velocity + cannon muzzle in nose direction:
```typescript
const shipVel = ship.velocity()  // {x, y}
const muzzle = config.cannon.speed
const vx = shipVel.x + fx * muzzle
const vy = shipVel.y + fy * muzzle
```

### Cell-find on impact

Given an asteroid (or other destructible) at body world position `(px, py)`, rotation `r`, and impact world point `(ix, iy)`:

```typescript
function findClosestCell(asteroid: SpawnedBody, impact: { x: number; y: number }): { gx: number; gy: number } | null {
  const body = asteroid.body
  const pos = body.translation()
  const rot = body.rotation()
  const cos = Math.cos(rot)   // physics convention: +rot
  const sin = Math.sin(rot)
  const grid = asteroid.grid
  const cellScale = asteroid.cellScale
  const com = asteroid.com    // {x, y} body-local COM (already on SpawnedBody from Phase 3 fix)

  let bestGx = -1, bestGy = -1, bestDist = Infinity
  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      if (!grid.get(gx, gy)) continue
      // body-local cell center
      const lx = (gx - grid.width / 2 + 0.5) * cellScale - com.x
      const ly = (gy - grid.height / 2 + 0.5) * cellScale - com.y
      // world via +rot
      const wx = pos.x + lx * cos - ly * sin
      const wy = pos.y + lx * sin + ly * cos
      const dx = wx - impact.x
      const dy = wy - impact.y
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        bestGx = gx
        bestGy = gy
      }
    }
  }
  return bestGx >= 0 ? { gx: bestGx, gy: bestGy } : null
}
```

### Impact flash decay

A flash at `(x, y)` with `spawnTime t0` has age `currentTime - t0`. Lifetime `FLASH_LIFETIME = 0.15` (150ms).

```typescript
const age = currentTime - flash.spawnTime
const t = age / FLASH_LIFETIME            // 0 to 1
const radius = flash.initialRadius * (1 + t * 1.5)   // expands to 2.5x
const alpha = (1 - t) * 0.9              // fades from 0.9 to 0
```

If `age >= FLASH_LIFETIME`, drop the flash from the array.

Render in `flashGfx`:
```typescript
this.flashGfx.clear()
for (const flash of this.flashes) {
  // ... compute radius/alpha
  this.flashGfx.circle(flash.x, -flash.y, radius).fill({ color: 0xffffaa, alpha })
}
```

(Note Y-flip on flash position to match sprite Y-flip convention from Phase 3.)

### Projectile sprite

`renderProjectileToCanvas(ctx, radius)` mirrors `renderStarToCanvas` but with a tighter bright bolt:

```typescript
const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius)
grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)')   // white core
grad.addColorStop(0.4, 'rgba(180, 230, 255, 0.9)')   // pale blue
grad.addColorStop(1.0, 'rgba(80, 160, 255, 0.0)')    // transparent edge
ctx.fillStyle = grad
ctx.fillRect(0, 0, 2 * radius, 2 * radius)
```

`bakeProjectileSprite` uses radius `8` (16x16 canvas). Sprite cached on the renderer.

## Combat.tryFireFromShip behavior

```typescript
tryFireFromShip(ctx: GameContext): boolean {
  const ship = ctx.ship
  if (!ship || !ship.canFire()) return false

  const sp = ship.position()
  const sv = ship.velocity()
  const r = ship.rotation()
  const fx = Math.sin(r)
  const fy = Math.cos(r)
  const cfg = ctx.config.gameplay.ship.cannon

  const spawnX = sp.x + fx * NOSE_OFFSET
  const spawnY = sp.y + fy * NOSE_OFFSET
  const vx = sv.x + fx * cfg.speed
  const vy = sv.y + fy * cfg.speed

  // Spawn a 1x1 minimal grid for the projectile (Type used is irrelevant; renderer special-cases)
  const grid = new GridComposite(1, 1)
  grid.set(0, 0, Type.EXOTIC)  // any nonzero-mass type
  const spawned = spawnComposite(ctx.rapierWorld, grid, spawnX, spawnY, vx, vy, 4, {
    enableCollisionEvents: true,
  })
  // Override mass via density tweak? For v1 leave as default (Type.EXOTIC mass).
  const id = ctx.registry.add('projectile', spawned)
  this.projectileSpawnTimes.set(id, this.currentTime)
  ctx.renderer.onBodyAdded(ctx.registry.get(id)!)

  ship.markFired()

  ctx.events.emit({
    type: 'CANNON_FIRE',
    x: spawnX,
    y: spawnY,
    energy: cfg.energy,
  })

  return true
}
```

## Combat.handleCollision behavior

```typescript
handleCollision(ctx: GameContext, e: GameEvent): void {
  const tags = e.tags as Array<string | undefined> | undefined
  const ids = e.ids as Array<number | undefined> | undefined
  if (!tags || !ids) return

  // Find which slot is the projectile, if any
  let projIdx = -1
  if (tags[0] === 'projectile') projIdx = 0
  else if (tags[1] === 'projectile') projIdx = 1
  else return  // not a projectile collision

  const projId = ids[projIdx]
  const otherId = ids[1 - projIdx]
  const otherTag = tags[1 - projIdx]
  if (projId === undefined) return

  // Friendly fire: skip damage on ship
  const isShipHit = otherTag === 'ship'

  if (otherId !== undefined && !isShipHit) {
    const otherEntry = ctx.registry.get(otherId)
    if (otherEntry) {
      // Spawn flash at impact point (event x/y is midpoint of body translations)
      this.flashes.push({
        x: e.x,
        y: e.y,
        spawnTime: this.currentTime,
        initialRadius: 6,
      })

      // Find closest cell to impact and remove it
      const target = findClosestCell(otherEntry.spawned, { x: e.x, y: e.y })
      if (target) {
        removeCell(ctx.rapierWorld, otherEntry.spawned, target.gx, target.gy)
        // Emit BOND_BREAK so SoundEngine plays a hit sound
        ctx.events.emit({
          type: 'BOND_BREAK',
          x: e.x,
          y: e.y,
          energy: e.energy,
        })

        // If the body has no cells left, despawn it entirely
        if (!hasAnyCells(otherEntry.spawned.grid)) {
          despawnBody(ctx, otherId)
        }
      }
    }
  }

  // Despawn projectile on any collision (including with ship)
  this.projectileSpawnTimes.delete(projId)
  despawnBody(ctx, projId)
}

function hasAnyCells(grid: GridComposite): boolean {
  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      if (grid.get(gx, gy)) return true
    }
  }
  return false
}
```

## Combat.update behavior

```typescript
update(ctx: GameContext, dt: number): void {
  this.currentTime += dt
  const lifetime = ctx.config.gameplay.ship.cannon.lifetime

  // Despawn expired projectiles
  for (const [id, spawnTime] of this.projectileSpawnTimes) {
    if (this.currentTime - spawnTime > lifetime) {
      this.projectileSpawnTimes.delete(id)
      despawnBody(ctx, id)
    }
  }

  // Decay flashes
  this.flashes = this.flashes.filter(f => this.currentTime - f.spawnTime < FLASH_LIFETIME)

  // Redraw flashGfx
  this.flashGfx.clear()
  for (const flash of this.flashes) {
    const age = this.currentTime - flash.spawnTime
    const t = age / FLASH_LIFETIME
    const radius = flash.initialRadius * (1 + t * 1.5)
    const alpha = (1 - t) * 0.9
    this.flashGfx.circle(flash.x, -flash.y, radius).fill({ color: 0xffffaa, alpha })
  }
}
```

## main.ts integration

```typescript
import { Combat } from './game/combat'

// After renderer construction:
const combat = new Combat(renderer.getWorldContainer())

const ctx: GameContext = {
  // existing
  combat,
}

// In MainMenu.onStart and bootDevMode (alongside soundEngine init):
ctx.combat.subscribeTo(ctx)

// In fixedUpdate, inside `if (ctx.ship)` block, after applyControls:
ctx.ship.tickCooldown(dt)
if (ctx.input.isAction('fire_cannon')) {
  ctx.combat.tryFireFromShip(ctx)
}

// After ctx.ship.clampSpeed():
ctx.combat.update(ctx, dt)
```

## Tests

### `combat.test.ts` (new)

1. `tryFireFromShip returns false when ship is not present`.
2. `tryFireFromShip returns false when cooldown is active`.
3. `tryFireFromShip spawns a projectile, marks fired, emits CANNON_FIRE` (mock event spy + registry inspect).
4. `update despawns projectiles after their lifetime` (advance currentTime past lifetime, verify body removed).
5. `handleCollision removes closest cell on projectile-asteroid hit`.
6. `handleCollision emits BOND_BREAK on damage`.
7. `handleCollision skips damage when other body is the ship` (friendly-fire test).
8. `handleCollision despawns body when last cell removed`.
9. `handleCollision despawns projectile after collision`.
10. `reset clears projectile state and flashes`.

### `ship.test.ts` (additions)

11. `cannonCooldown starts at 0 (ready to fire)`.
12. `tickCooldown decrements cooldown by dt`.
13. `markFired sets cooldown to cooldownDuration`.
14. `canFire returns false during cooldown, true after`.

### `collision-events.test.ts` (addition)

15. `COLLISION event includes ids [number, number] matching the colliding bodies`.

### `lifecycle.test.ts` (additions)

16. `despawnAll calls combat.reset()` (mock combat).
17. `despawnBody removes from registry and notifies renderer`.

### `texture-bake.test.ts` (additions)

18. `renderProjectileToCanvas uses radial gradient`.
19. `renderProjectileToCanvas uses three color stops` (white core, pale blue mid, transparent edge).

## Risks / open questions

1. **Projectile mass leaking into asteroid orbit perturbation.** With `Type.EXOTIC` default mass and small cellScale=4, the projectile mass is small but nonzero. On collision, momentum transfers to the asteroid, perturbing its orbit. Acceptable (looks realistic). If too much, lower projectile mass via custom density override in spawnComposite.

2. **Cooldown of 0.3s vs ship max_speed 250.** Holding Space at 0.3s cadence fires ~3 bullets/sec; combined with ship speed 250, projectiles spread slightly behind. Acceptable.

3. **Flash position uses event x/y (body-translation midpoint), not actual contact point.** Rapier's collision event API gives collider handles but no contact point in the simple `drainCollisionEvents` path. The midpoint is a fair approximation; for true contact-point drawing we'd switch to `drainContactForceEvents` (Phase 3 review note). Defer.

4. **Despawning a body during collision-event processing.** Rapier may still iterate the just-removed body's contacts in the same step. Test: spawn two asteroids, projectile, drain events. If crashes, defer the despawn one tick. Per Rapier docs, removing bodies from inside collision callbacks is supported.

5. **`subscribeTo` idempotency**: like SoundEngine, Combat's subscribeTo guards via a `subscribed` flag so re-entering Play after Quit doesn't double-register.

6. **Projectile-projectile collisions**: handler ignores them (handler returns early if no slot is 'projectile'... wait, both slots ARE 'projectile' in projectile-projectile). Actually the handler enters with projIdx=0, otherTag='projectile', and `isShipHit=false`, then attempts to find the closest cell on the OTHER projectile and remove it. The other projectile is 1x1, so removing it leaves zero cells → despawn. So projectile-projectile mutual destruction "works" by accident: each collision event triggers BOTH projectiles being despawned (since the handler runs once per pair, not per body). Acceptable but a bit accidental. Document.

7. **Camera shake on projectile collision**: the COLLISION listener in main.ts already shakes if 'ship' is in tags. Projectile collisions don't shake. That's fine; the impact flash + sound is enough feedback. If we want shake on hits, extend the listener to also shake when 'projectile' is in tags (gated on lower magnitude than ship hits).

## Out of scope (deferred)

- Projectile types (different weapons, different damage/cooldown).
- Targeting reticle / aim assist.
- Damage numbers floating up from impact.
- Particle debris from cell removal.
- Splash damage radius.
- Asteroid splitting into smaller asteroids.
- Per-cell HP (currently one hit = one cell).
- Friendly fire enabled mode.
- Mouse-click targeting.
- Visual cooldown indicator on HUD (currently no UI signal that cannon is cooling down).
