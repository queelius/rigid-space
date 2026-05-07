import RAPIER from '@dimforge/rapier2d-compat'
import { Application } from 'pixi.js'
import { loadConfig } from './config/loader'
import { applyTypeConfig, Type } from './engine/types'
import { GridComposite } from './engine/grid-composite'
import { spawnComposite } from './engine/rigid-spawn'
import { BodyRegistry } from './engine/body-registry'
import { applyGravity } from './engine/gravity'
import { Ship } from './game/ship'
import { InputManager } from './game/input'
import { ScreenStack } from './game/screen-stack'
import { EventBus } from './engine/events'
import { GraphicsBodyRenderer } from './render/body-renderer'
import { createGameLoop } from './game/game-loop'
import { Camera } from './game/camera'
import { SoundEngine } from './game/sound'
import { drainCollisionEvents } from './game/collision-events'
import type { GameContext } from './game/game-context'

async function main() {
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

  const rapierWorld = new RAPIER.World(new RAPIER.Vector2(0, 0))
  const eventQueue = new RAPIER.EventQueue(true)
  const registry = new BodyRegistry()
  const input = new InputManager()
  await input.loadConfig()
  window.addEventListener('keydown', e => input.handleKeyDown(e))
  window.addEventListener('keyup', e => input.handleKeyUp(e))
  const screenStack = new ScreenStack()
  const events = new EventBus()
  const renderer = new GraphicsBodyRenderer(app)
  const camera = new Camera()
  const soundEngine = new SoundEngine()

  // Spawn star: 1x1 EXOTIC, kinematic. Replace cuboid with ball collider that has
  // ActiveEvents.COLLISION_EVENTS so ship-vs-star bumps fire COLLISION events.
  const starGrid = new GridComposite(1, 1)
  starGrid.set(0, 0, Type.EXOTIC)
  const starSpawned = spawnComposite(rapierWorld, starGrid, 0, 0, 0, 0, 50, { kinematic: true })
  const starCuboid = starSpawned.colliderMap.get('0,0')!
  rapierWorld.removeCollider(starCuboid, false)
  rapierWorld.createCollider(
    RAPIER.ColliderDesc.ball(50)
      .setDensity(100)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    starSpawned.body,
  )
  starSpawned.colliderMap.delete('0,0')
  registry.add('star', starSpawned, { proximityKey: 'star', radius: 50 })

  // Spawn ship at (500, 0) at rest with SC2 damping config
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
  const ship = new Ship(shipId, shipSpawned, config.gameplay.ship)

  // Spawn 20 asteroids in rough orbits, with collision events enabled
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
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        if (Math.random() < 0.7) {
          grid.set(gx, gy, Math.random() < 0.2 ? Type.IRON : Type.ROCK)
        }
      }
    }
    const spawned = spawnComposite(rapierWorld, grid, x, y, vx, vy, 8, {
      enableCollisionEvents: true,
    })
    registry.add('asteroid', spawned)
  }

  const ctx: GameContext = {
    app, hudCanvas,
    rapierWorld, eventQueue,
    registry,
    ship,                // not undefined here; menu lifecycle adds the optional path in Task 14
    input, screenStack, events,
    config, renderer, camera, soundEngine,
  }

  // HUD render. This is replaced by GameHUD ScreenState in Task 14.
  function renderHUD(): void {
    const w = app.screen.width
    const h = app.screen.height
    if (hudCanvas.width !== w) hudCanvas.width = w
    if (hudCanvas.height !== h) hudCanvas.height = h
    const hctx = hudCanvas.getContext('2d')!
    hctx.clearRect(0, 0, w, h)
    hctx.fillStyle = '#aaa'
    hctx.font = '14px monospace'
    hctx.fillText('Rigid Space  |  Rapier2D WASM', 10, 20)
    hctx.fillText(`Bodies: ${registry.all().length}  |  WASD: fly`, 10, 40)
    hctx.fillText(`Speed: ${ship.speed().toFixed(0)} / ${ship.maxSpeed}`, 10, 60)
  }

  const loop = createGameLoop(config.gameplay.physics.timestep, {
    fixedUpdate(_dt) {
      if (!screenStack.paused) {
        ship.applyControls(input)
        applyGravity(registry, 50000, 'star')
        rapierWorld.step(eventQueue)
        drainCollisionEvents(rapierWorld, eventQueue, registry, events,
                             config.gameplay.collision.event_threshold)
        ship.clampSpeed()
      }
      screenStack.update(_dt)
    },
    render(_interpolation) {
      camera.setTarget(ship.position().x, ship.position().y)
      camera.update(1 / 60)
      renderer.renderBodies(registry, ctx.camera, ship)
      renderHUD()
    },
  })

  loop.start()
}

main()
