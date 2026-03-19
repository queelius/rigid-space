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
