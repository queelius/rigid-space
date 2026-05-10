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
import type { Combat } from './combat'

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
  combat: Combat
}
