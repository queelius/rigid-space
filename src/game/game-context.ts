/**
 * Shared game context passed to extracted modules.
 * Bundles the core game objects that main.ts creates at startup.
 * Avoids module-level closures and makes dependencies explicit.
 */

import type { Galaxy, SpawnedComposite } from './galaxy'
import type { Ship } from './ship'
import type { Builder } from './builder'
import type { Renderer } from '../render/renderer'
import type { InputManager } from './input'
import type { SoundEngine } from './sound'
import type { EventBus } from '../engine/events'
import type { QuestLog } from './quests'
import type { ScreenStack } from './screen-stack'
import type { HyperspaceWorld } from './hyperspace'
import type { TradeState } from './trade'
import type { NPC } from './npc'
import type { GameConfig } from '../config/loader'
import type { GravityPool } from '../engine/gravity-pool'
import type { FlareConfig } from './solar-flares'
import type { ParticleReferences } from '../engine/particle-remove'

/** Gameplay tunables loaded from gameplay.yaml, mutable via applyGameplayConfig */
export interface GameplayTunables {
  dt: number
  physSubsteps: number
  thrustStrength: number
  rotationRate: number
  cannonMass: number
  cannonSpeed: number
  flareConfig: FlareConfig
  orbitStationBlend: number
  orbitDefaultBlend: number
  hyperFuelPerMass: number
  hyperMinFuel: number
}

/** Callbacks from main.ts that extracted modules need to invoke */
export interface MainCallbacks {
  popBuilderState: () => void
  enterSystem: (id: number, fromId?: number) => Promise<void>
  findNearbyStation: () => { stationIdx: number; comp: SpawnedComposite; dist: number } | null
  getStations: () => SpawnedComposite[]
  buildParticleRefs: () => ParticleReferences
}

export interface GameContext {
  galaxy: Galaxy
  ship: Ship
  builder: Builder
  renderer: Renderer
  input: InputManager
  sound: SoundEngine
  events: EventBus
  questLog: QuestLog
  screenStack: ScreenStack
  tradeState: TradeState
  canvas: HTMLCanvasElement

  // Mutable state managed by main.ts, accessed by extracted modules
  gameConfig: GameConfig | null
  hyperspaceWorld: HyperspaceWorld | null
  gravityPool: GravityPool | null
  activeNPC: NPC | null
  orbitLocked: boolean
  stationNPCs: Map<number, NPC>

  // Gameplay tunables and callbacks
  tunables: GameplayTunables
  callbacks: MainCallbacks
}
