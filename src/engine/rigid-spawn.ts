/**
 * Spawn a GridComposite as a Rapier rigid body with compound colliders.
 *
 * Each filled grid cell becomes a box collider offset from the body's center.
 * The body's center of mass is computed from cell masses.
 * Returns the created RigidBody handle.
 */

import RAPIER from '@dimforge/rapier2d-compat'
import type { GridComposite } from './grid-composite'
import { typeProps } from './types'

export interface SpawnedBody {
  body: RAPIER.RigidBody
  /** Map from "gx,gy" to collider handle for cell damage/removal */
  colliderMap: Map<string, RAPIER.Collider>
  /** Total mass of all cells */
  totalMass: number
  /** Grid reference (for rendering) */
  grid: GridComposite
  /** Cell scale used at spawn */
  cellScale: number
  /** Center of mass in body-local coordinates (body-local Y points up) */
  com: { x: number; y: number }
}

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

  return { body, colliderMap, totalMass, grid, cellScale, com: { x: comX, y: comY } }
}

/** Remove a cell's collider from a spawned body (damage/mining). */
export function removeCell(
  world: RAPIER.World,
  spawned: SpawnedBody,
  gx: number,
  gy: number,
): boolean {
  const key = `${gx},${gy}`
  const collider = spawned.colliderMap.get(key)
  if (!collider) return false

  world.removeCollider(collider, true)
  spawned.colliderMap.delete(key)
  spawned.grid.clear(gx, gy)
  return true
}
