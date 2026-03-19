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
