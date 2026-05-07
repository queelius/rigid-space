import RAPIER from '@dimforge/rapier2d-compat'
import { Application } from 'pixi.js'
import { loadConfig } from './config/loader'
import { applyTypeConfig } from './engine/types'
import { BodyRegistry } from './engine/body-registry'
import { applyGravity } from './engine/gravity'
import { InputManager } from './game/input'
import { ScreenStack } from './game/screen-stack'
import { EventBus } from './engine/events'
import { GraphicsBodyRenderer } from './render/body-renderer'
import { createGameLoop } from './game/game-loop'
import { Camera } from './game/camera'
import { SoundEngine } from './game/sound'
import { drainCollisionEvents } from './game/collision-events'
import { spawnInitialWorld, despawnAll, updateAudio } from './game/lifecycle'
import { MainMenu } from './game/states/main-menu'
import { GameHUD } from './game/states/game-hud'
import { PauseMenu } from './game/states/pause-menu'
import type { GameContext } from './game/game-context'

async function main(): Promise<void> {
  await RAPIER.init()

  const config = await loadConfig()
  applyTypeConfig(config.types)

  const app = new Application()
  await app.init({
    canvas: document.getElementById('game') as HTMLCanvasElement,
    resizeTo: window,
    backgroundColor: 0x050510,
    antialias: true,
    preference: 'webgl',
  })
  const hudCanvas = document.getElementById('hud') as HTMLCanvasElement

  const input = new InputManager()
  await input.loadConfig()

  const ctx: GameContext = {
    app,
    hudCanvas,
    rapierWorld: new RAPIER.World(new RAPIER.Vector2(0, 0)),
    eventQueue: new RAPIER.EventQueue(true),
    registry: new BodyRegistry(),
    ship: undefined,
    input,
    screenStack: new ScreenStack(),
    events: new EventBus(),
    config,
    renderer: new GraphicsBodyRenderer(app),
    camera: new Camera(),
    soundEngine: new SoundEngine(),  // not init'd yet; init runs on user gesture
  }

  // Lifecycle helpers wired with state-pushing callbacks (avoids circular imports
  // between lifecycle.ts and the state classes).
  function enterPlaying(): void {
    // Idempotent: ignore re-entry while ctx.ship is already populated.
    if (ctx.ship) return
    spawnInitialWorld(ctx)
    ctx.screenStack.push(makeGameHUD())
  }

  function exitToMainMenu(): void {
    while (!ctx.screenStack.isEmpty) ctx.screenStack.pop()
    despawnAll(ctx)
    ctx.screenStack.push(makeMainMenu())
  }

  function pushPauseMenu(): void {
    // Silence thrust loop immediately on pause; next unpaused fixedUpdate tick
    // will re-sync from ship.isThrusting() if the key is still held.
    ctx.soundEngine.setContinuous('thrust', false)
    ctx.screenStack.push(new PauseMenu({
      onResume: () => ctx.screenStack.pop(),
      onQuitToMain: exitToMainMenu,
    }))
  }

  function makeGameHUD(): GameHUD {
    return new GameHUD(
      {
        bodyCount: () => ctx.registry.all().length,
        shipSpeed: () => ctx.ship?.speed() ?? 0,
        shipMaxSpeed: () => ctx.ship?.maxSpeed ?? 0,
        shipPosition: () => ctx.ship?.position() ?? { x: 0, y: 0 },
      },
      { onPause: pushPauseMenu },
    )
  }

  function makeMainMenu(): MainMenu {
    return new MainMenu({
      onStart: () => {
        ctx.soundEngine.init(ctx.config.sounds)
        ctx.soundEngine.subscribeTo(ctx.events)
        ctx.screenStack.pop()
        enterPlaying()
      },
      onQuit: () => window.close(),
    })
  }

  // Input dispatch: ScreenStack first, then InputManager (poll-based gameplay).
  window.addEventListener('keydown', e => {
    // Filter auto-repeats from menu/state navigation, but still let
    // InputManager record held-key state for gameplay polling.
    if (!e.repeat) {
      const key = e.key.toLowerCase()
      if (ctx.screenStack.handleKey(key)) e.preventDefault()
    }
    ctx.input.handleKeyDown(e)
  })
  window.addEventListener('keyup', e => ctx.input.handleKeyUp(e))

  // Camera shake on ship-involved collisions.
  ctx.events.on('COLLISION', e => {
    const tags = Array.isArray(e.tags) ? (e.tags as Array<string | undefined>) : undefined
    if (!tags?.includes('ship')) return
    ctx.camera.shake(Math.min((e.energy as number) / 500, 1.0))
  })

  // Boot route.
  const dev = new URLSearchParams(location.search).has('dev')
  if (dev) {
    enterPlaying()
    // First keydown unlocks audio.
    const onFirstKey = (): void => {
      ctx.soundEngine.init(ctx.config.sounds)
      ctx.soundEngine.subscribeTo(ctx.events)
      window.removeEventListener('keydown', onFirstKey)
    }
    window.addEventListener('keydown', onFirstKey)
  } else {
    ctx.screenStack.push(makeMainMenu())
  }

  createGameLoop(config.gameplay.physics.timestep, {
    fixedUpdate(dt) {
      if (!ctx.screenStack.paused && ctx.ship) {
        ctx.ship.applyControls(ctx.input)
        applyGravity(ctx.registry, 50000, 'star')
        ctx.rapierWorld.step(ctx.eventQueue)
        drainCollisionEvents(
          ctx.rapierWorld, ctx.eventQueue, ctx.registry,
          ctx.events, config.gameplay.collision.event_threshold,
        )
        ctx.ship.clampSpeed()
        updateAudio(ctx)
      }
      ctx.screenStack.update(dt)
    },
    render(_alpha) {
      const target = ctx.ship?.position() ?? { x: 0, y: 0 }
      ctx.camera.setTarget(target.x, target.y)
      ctx.camera.update(1 / 60)
      ctx.renderer.renderBodies(ctx.registry, ctx.camera, ctx.ship)

      const c2d = hudCanvas.getContext('2d')!
      const w = app.screen.width
      const h = app.screen.height
      if (hudCanvas.width !== w) hudCanvas.width = w
      if (hudCanvas.height !== h) hudCanvas.height = h
      c2d.clearRect(0, 0, w, h)
      ctx.screenStack.render(c2d, w, h)
    },
  }).start()
}

main()
