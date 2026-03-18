import type { GridComposite } from '../engine/grid-composite'
import { Type } from '../engine/types'

export function hasDriveCore(grid: GridComposite): boolean {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.get(x, y)
      if (cell && cell.type === Type.DRIVECORE) return true
    }
  }
  return false
}

export interface EntryConditions {
  speedThreshold: number
  distanceThreshold: number
}

export interface EntryResult {
  canEnter: boolean
  reason?: 'no_drivecore' | 'too_slow' | 'too_close'
  speedFraction?: number
}

export function checkEntryConditions(
  grid: GridComposite,
  shipSpeed: number,
  distanceFromStar: number,
  conditions: EntryConditions,
): EntryResult {
  if (!hasDriveCore(grid)) return { canEnter: false, reason: 'no_drivecore' }
  if (shipSpeed < conditions.speedThreshold) {
    return { canEnter: false, reason: 'too_slow', speedFraction: shipSpeed / conditions.speedThreshold }
  }
  if (distanceFromStar < conditions.distanceThreshold) return { canEnter: false, reason: 'too_close' }
  return { canEnter: true }
}
