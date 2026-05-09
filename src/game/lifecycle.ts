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
  // ActiveEvents.COLLISION_EVENTS so ship-vs-star bumps fire COLLISION events.
  const starGrid = new GridComposite(1, 1)
  starGrid.set(0, 0, Type.EXOTIC)
  const starSpawned = spawnComposite(rapierWorld, starGrid, 0, 0, 0, 0, 50, { kinematic: true })
  const starCuboid = starSpawned.colliderMap.get('0,0')!
  rapierWorld.removeCollider(starCuboid, false)
  const ballCollider = rapierWorld.createCollider(
    RAPIER.ColliderDesc.ball(50)
      .setDensity(100)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    starSpawned.body,
  )
  starSpawned.colliderMap.delete('0,0')
  starSpawned.colliderMap.set('ball', ballCollider)
  const starId = registry.add('star', starSpawned, { proximityKey: 'star', radius: 50 })
  ctx.renderer.onBodyAdded(registry.get(starId)!)

  // Ship: 3x5 grid at (500, 0) at rest with SC2 damping
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
  ctx.renderer.onBodyAdded(registry.get(shipId)!)
  ctx.ship = new Ship(shipId, shipSpawned, config.gameplay.ship)

  // Asteroids: 20 randomized 1x1 to 3x3 ROCK/IRON grids in rough orbits.
  // Guarantee at least one cell is set so asteroids never have zero mass.
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

    // Fill cells with 70% probability each.
    let cellsSet = 0
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        if (Math.random() < 0.7) {
          grid.set(gx, gy, Math.random() < 0.2 ? Type.IRON : Type.ROCK)
          cellsSet++
        }
      }
    }
    // Ensure at least one cell is set so we never spawn a zero-mass ghost body.
    if (cellsSet === 0) {
      grid.set(0, 0, Type.ROCK)
    }

    const spawned = spawnComposite(rapierWorld, grid, x, y, vx, vy, 8, {
      enableCollisionEvents: true,
    })
    const asteroidId = registry.add('asteroid', spawned)
    ctx.renderer.onBodyAdded(registry.get(asteroidId)!)
  }
}

/**
 * Tear down the playable scene: remove every body from Rapier and the registry,
 * silence continuous audio, reset camera. Caller is responsible for pushing MainMenu.
 */
export function despawnAll(ctx: GameContext): void {
  ctx.soundEngine?.setContinuous('thrust', false)
  const ids = ctx.registry.all().map(e => e.id)
  for (const id of ids) {
    ctx.renderer.onBodyRemoved(id)
    ctx.registry.remove(ctx.rapierWorld, id)
  }
  // Drain any pending collision events so they don't leak into the next session.
  ctx.eventQueue.drainCollisionEvents(() => {})
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
