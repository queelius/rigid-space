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
import type { GameContext } from './game/game-context'

async function main() {
  // 1. Init Rapier WASM
  await RAPIER.init()

  // 2. Load config, apply type properties
  const config = await loadConfig()
  applyTypeConfig(config.types)

  // 3. Init PixiJS
  const app = new Application()
  await app.init({
    canvas: document.getElementById('game') as HTMLCanvasElement,
    resizeTo: window,
    backgroundColor: 0x050510,
    antialias: true,
    preference: 'webgl',
  })

  // 4. Create core systems
  const rapierWorld = new RAPIER.World(new RAPIER.Vector2(0, 0))
  const registry = new BodyRegistry()
  const input = new InputManager()
  await input.loadConfig()
  window.addEventListener('keydown', e => input.handleKeyDown(e))
  window.addEventListener('keyup', e => input.handleKeyUp(e))
  const screenStack = new ScreenStack()
  const events = new EventBus()
  const renderer = new GraphicsBodyRenderer(app)

  // 5. Spawn star (1x1 EXOTIC, kinematic, ball collider)
  const starGrid = new GridComposite(1, 1)
  starGrid.set(0, 0, Type.EXOTIC)
  const starSpawned = spawnComposite(rapierWorld, starGrid, 0, 0, 0, 0, 50, true)
  // Replace cuboid with ball collider for circular star
  const starCuboid = starSpawned.colliderMap.get('0,0')!
  rapierWorld.removeCollider(starCuboid, false)
  rapierWorld.createCollider(
    RAPIER.ColliderDesc.ball(50).setDensity(100),
    starSpawned.body,
  )
  starSpawned.colliderMap.delete('0,0')
  registry.add('star', starSpawned)

  // 6. Spawn ship (3x5 grid)
  const shipGrid = new GridComposite(3, 5)
  shipGrid.set(1, 4, Type.COCKPIT)   // nose
  shipGrid.set(0, 2, Type.THRUSTER)  // left engine
  shipGrid.set(2, 2, Type.THRUSTER)  // right engine
  shipGrid.set(1, 2, Type.REACTOR)   // center
  shipGrid.set(1, 1, Type.FUEL)
  shipGrid.set(1, 0, Type.FUEL)
  const shipSpawned = spawnComposite(rapierWorld, shipGrid, 300, 0, 0, 30, 10)
  const shipId = registry.add('ship', shipSpawned)
  const ship = new Ship(shipId, shipSpawned, config.gameplay.ship)

  // 7. Spawn asteroids
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = 150 + Math.random() * 400
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    const v = 20 + Math.random() * 15
    const vx = -Math.sin(angle) * v
    const vy = Math.cos(angle) * v
    const size = 1 + Math.floor(Math.random() * 3) // 1x1 to 3x3

    const grid = new GridComposite(size, size)
    for (let gy = 0; gy < size; gy++) {
      for (let gx = 0; gx < size; gx++) {
        if (Math.random() < 0.7) {
          grid.set(gx, gy, Math.random() < 0.2 ? Type.IRON : Type.ROCK)
        }
      }
    }
    const spawned = spawnComposite(rapierWorld, grid, x, y, vx, vy, 8)
    registry.add('asteroid', spawned)
  }

  // 8. Build context
  const ctx: GameContext = {
    rapierWorld, registry, ship, input, screenStack, events, config, renderer,
    camera: { x: 0, y: 0, zoom: 1 },
  }

  // 9. HUD setup
  const hudCanvas = document.getElementById('hud') as HTMLCanvasElement

  function renderHUD(): void {
    const w = app.screen.width
    const h = app.screen.height
    if (hudCanvas.width !== w || hudCanvas.height !== h) {
      hudCanvas.width = w
      hudCanvas.height = h
    }
    const hctx = hudCanvas.getContext('2d')!
    hctx.clearRect(0, 0, w, h)
    hctx.fillStyle = '#aaa'
    hctx.font = '14px monospace'
    hctx.fillText('Rigid Space  |  Rapier2D WASM', 10, 20)
    hctx.fillText(`Bodies: ${registry.all().length}  |  WASD: fly`, 10, 40)
    hctx.fillText(`Speed: ${ship.speed().toFixed(0)}`, 10, 60)
  }

  // 10. Start game loop
  const loop = createGameLoop(config.gameplay.physics.timestep, {
    fixedUpdate(_dt) {
      if (!screenStack.paused) {
        ship.applyControls(input)
        applyGravity(registry, 50000, 'star')
        rapierWorld.step()
      }
      screenStack.update(_dt)
    },
    render(_interpolation) {
      ctx.camera.x = ship.position().x
      ctx.camera.y = ship.position().y
      renderer.renderBodies(registry, ctx.camera)
      renderHUD()
    },
  })

  loop.start()
}

main()
