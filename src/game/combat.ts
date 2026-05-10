// Combat: cannon firing, projectile lifetime, damage handler, impact flashes.
//
// One Combat instance is owned by GameContext. It:
//   - spawns projectiles from the ship at config-driven cooldown rate
//   - tracks per-projectile spawn times and despawns after lifetime expiry
//   - subscribes to COLLISION events to remove the closest cell from the
//     non-projectile body (skipping friendly fire on the ship)
//   - draws short-lived radial flashes at impact points inside the world
//     container so they auto-scale with zoom and shake with the camera
//
// Friendly fire is disabled by skipping cell removal when the other slot's tag
// is 'ship'; the projectile still despawns on contact in either case.

import { Container, Graphics } from 'pixi.js'
import { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'
import { spawnComposite, removeCell, type SpawnedBody } from '../engine/rigid-spawn'
import { despawnBody } from './lifecycle'
import type { GameContext } from './game-context'
import type { GameEvent } from '../engine/events'

/** Distance from ship center to projectile spawn point along nose direction.
 *  Body-local +Y of cockpit is ~22; clear it plus margin so the projectile
 *  doesn't immediately collide with the firing ship. */
const NOSE_OFFSET = 30

/** Lifetime of an impact flash in seconds (150ms). */
const FLASH_LIFETIME = 0.15

export interface ImpactFlash {
  /** World x. */
  x: number
  /** World y. */
  y: number
  /** Time the flash was added (Combat-local clock). */
  spawnTime: number
  /** Initial radius in world units; flash expands from this value. */
  initialRadius: number
}

export class Combat {
  private flashGfx: Graphics
  /** Projectile registry id -> spawn time (Combat-local clock). */
  private projectileSpawnTimes = new Map<number, number>()
  private flashes: ImpactFlash[] = []
  /** Combat-local accumulator advanced once per fixed update. */
  private currentTime = 0
  private subscribed = false

  constructor(worldContainer: Container) {
    this.flashGfx = new Graphics()
    worldContainer.addChild(this.flashGfx)
  }

  /** Subscribe to COLLISION events on the bus. Idempotent: subsequent calls
   *  are no-ops, matching the SoundEngine pattern. */
  subscribeTo(ctx: GameContext): void {
    if (this.subscribed) return
    this.subscribed = true
    ctx.events.on('COLLISION', e => this.handleCollision(ctx, e))
  }

  /** Spawn a projectile from the ship if cooldown allows. Returns true on fire. */
  tryFireFromShip(ctx: GameContext): boolean {
    const ship = ctx.ship
    if (!ship || !ship.canFire()) return false

    const sp = ship.position()
    const sv = ship.velocity()
    const r = ship.rotation()
    // Visual nose direction in world: matches Ship.applyControls' (sin r, cos r).
    const fx = Math.sin(r)
    const fy = Math.cos(r)
    const cfg = ctx.config.gameplay.ship.cannon

    const spawnX = sp.x + fx * NOSE_OFFSET
    const spawnY = sp.y + fy * NOSE_OFFSET
    const vx = sv.x + fx * cfg.speed
    const vy = sv.y + fy * cfg.speed

    // 1x1 minimal grid for the projectile body. Type is irrelevant: the
    // SpriteBodyRenderer special-cases the 'projectile' tag, so the cell type
    // only affects mass (via Type.EXOTIC defaultMass).
    const grid = new GridComposite(1, 1)
    grid.set(0, 0, Type.EXOTIC)
    const spawned = spawnComposite(ctx.rapierWorld, grid, spawnX, spawnY, vx, vy, 4, {
      enableCollisionEvents: true,
    })
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

  /** Per-fixedUpdate tick: advance time, expire projectiles, decay flashes. */
  update(ctx: GameContext, dt: number): void {
    this.currentTime += dt
    const lifetime = ctx.config.gameplay.ship.cannon.lifetime

    // Despawn expired projectiles. Iterate over a snapshot of entries so
    // delete-during-iteration is safe.
    for (const [id, spawnTime] of [...this.projectileSpawnTimes]) {
      if (this.currentTime - spawnTime > lifetime) {
        this.projectileSpawnTimes.delete(id)
        despawnBody(ctx, id)
      }
    }

    // Decay flashes (drop entries past their lifetime).
    this.flashes = this.flashes.filter(f => this.currentTime - f.spawnTime < FLASH_LIFETIME)

    // Redraw flashGfx. Note Y-flip on flash position to match the renderer's
    // sprite Y-flip (sprite.position.y = -body.translation().y).
    this.flashGfx.clear()
    for (const flash of this.flashes) {
      const age = this.currentTime - flash.spawnTime
      const t = age / FLASH_LIFETIME
      const radius = flash.initialRadius * (1 + t * 1.5)   // expands to 2.5x
      const alpha = (1 - t) * 0.9                          // fades from 0.9 to 0
      this.flashGfx.circle(flash.x, -flash.y, radius).fill({ color: 0xffffaa, alpha })
    }
  }

  /** COLLISION event handler. Runs damage/flash for projectile-vs-other hits. */
  handleCollision(ctx: GameContext, e: GameEvent): void {
    const tags = e.tags as Array<string | undefined> | undefined
    const ids = e.ids as Array<number | undefined> | undefined
    if (!tags || !ids) return

    // Find which slot is the projectile.
    let projIdx = -1
    if (tags[0] === 'projectile') projIdx = 0
    else if (tags[1] === 'projectile') projIdx = 1
    else return  // not a projectile collision

    const projId = ids[projIdx]
    const otherId = ids[1 - projIdx]
    const otherTag = tags[1 - projIdx]
    if (projId === undefined) return

    // Friendly fire: never damage the firing ship.
    const isShipHit = otherTag === 'ship'

    if (otherId !== undefined && !isShipHit) {
      const otherEntry = ctx.registry.get(otherId)
      if (otherEntry) {
        // Spawn flash at the event position (midpoint of body translations).
        // Not a true contact point, but a fair approximation for v1.
        this.flashes.push({
          x: e.x,
          y: e.y,
          spawnTime: this.currentTime,
          initialRadius: 6,
        })

        // Find and remove the closest cell to the impact point.
        const target = findClosestCell(otherEntry.spawned, { x: e.x, y: e.y })
        if (target) {
          removeCell(ctx.rapierWorld, otherEntry.spawned, target.gx, target.gy)
          // BOND_BREAK is wired to a hit sound in sounds.yaml.
          ctx.events.emit({
            type: 'BOND_BREAK',
            x: e.x,
            y: e.y,
            energy: e.energy,
          })

          // Despawn the body when its last cell is gone.
          if (!hasAnyCells(otherEntry.spawned.grid)) {
            despawnBody(ctx, otherId)
          }
        }
      }
    }

    // Despawn the projectile on any collision (including with the firing ship).
    this.projectileSpawnTimes.delete(projId)
    despawnBody(ctx, projId)
  }

  /** Clear projectile state and flashes. Called from despawnAll on session end. */
  reset(): void {
    this.projectileSpawnTimes.clear()
    this.flashes = []
    this.flashGfx.clear()
  }
}

/** Find the filled cell whose world-space center is closest to the impact point.
 *  Uses the physics convention (+rot), matching Rapier's actual body frame
 *  (NOT the renderer's -rot visual convention). */
function findClosestCell(
  asteroid: SpawnedBody,
  impact: { x: number; y: number },
): { gx: number; gy: number } | null {
  const body = asteroid.body
  const pos = body.translation()
  const rot = body.rotation()
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const grid = asteroid.grid
  const cellScale = asteroid.cellScale
  const com = asteroid.com

  let bestGx = -1, bestGy = -1, bestDist = Infinity
  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      if (!grid.get(gx, gy)) continue
      // Body-local cell center, COM-corrected (matches rigid-spawn.ts math).
      const lx = (gx - grid.width / 2 + 0.5) * cellScale - com.x
      const ly = (gy - grid.height / 2 + 0.5) * cellScale - com.y
      // Body-local to world via +rot.
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

/** True if the grid has at least one filled cell. */
function hasAnyCells(grid: GridComposite): boolean {
  for (let gy = 0; gy < grid.height; gy++) {
    for (let gx = 0; gx < grid.width; gx++) {
      if (grid.get(gx, gy)) return true
    }
  }
  return false
}
