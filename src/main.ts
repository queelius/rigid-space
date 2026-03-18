/**
 * Rigid Space Engine - proof of concept
 *
 * Rapier2D rigid body physics + PixiJS rendering.
 * Star Control 2-inspired sandbox with rigid body composites.
 */

import RAPIER from '@dimforge/rapier2d-compat'
import { Application, Graphics } from 'pixi.js'

// ── Rapier init (WASM) ──────────────────────────────────────────────

async function main() {
  await RAPIER.init()

  // ── Physics world ──────────────────────────────────────────────────

  const gravity = new RAPIER.Vector2(0.0, 0.0)  // space: no global gravity
  const world = new RAPIER.World(gravity)

  // ── PixiJS renderer ────────────────────────────────────────────────

  const app = new Application()
  await app.init({
    canvas: document.getElementById('game') as HTMLCanvasElement,
    resizeTo: window,
    backgroundColor: 0x050510,
    antialias: true,
  })

  const gfx = new Graphics()
  app.stage.addChild(gfx)

  // Camera
  let camX = 0, camY = 0
  const zoom = 1

  // ── Create some test bodies ────────────────────────────────────────

  interface BodyInfo {
    body: RAPIER.RigidBody
    color: number
    halfW: number
    halfH: number
    shape: 'box' | 'circle'
    radius?: number
  }
  const bodies: BodyInfo[] = []

  // Central "star" - large kinematic body
  {
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(0, 0)
    const body = world.createRigidBody(desc)
    const colliderDesc = RAPIER.ColliderDesc.ball(50)
      .setDensity(100)
    world.createCollider(colliderDesc, body)
    bodies.push({ body, color: 0xFFDD44, halfW: 50, halfH: 50, shape: 'circle', radius: 50 })
  }

  // Ship - dynamic body with compound shape
  {
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(300, 0)
      .setLinvel(0, 30)  // orbital-ish velocity
    const body = world.createRigidBody(desc)

    // Hull: box
    const hullDesc = RAPIER.ColliderDesc.cuboid(10, 20)
      .setDensity(2)
      .setRestitution(0.3)
    world.createCollider(hullDesc, body)

    bodies.push({ body, color: 0x44AAFF, halfW: 10, halfH: 20, shape: 'box' })
  }

  // A few asteroids
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = 150 + Math.random() * 400
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r

    // Orbital velocity (approximate)
    const v = 20 + Math.random() * 15
    const vx = -Math.sin(angle) * v
    const vy = Math.cos(angle) * v

    const size = 3 + Math.random() * 8
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(vx, vy)
    const body = world.createRigidBody(desc)

    const colliderDesc = RAPIER.ColliderDesc.ball(size)
      .setDensity(1)
      .setRestitution(0.5)
    world.createCollider(colliderDesc, body)

    bodies.push({ body, color: 0x888888, halfW: size, halfH: size, shape: 'circle', radius: size })
  }

  // ── Custom gravity: attract everything to the star ─────────────────

  function applyGravity() {
    const G = 50000
    const starPos = bodies[0].body.translation()

    for (let i = 1; i < bodies.length; i++) {
      const body = bodies[i].body
      const pos = body.translation()
      const dx = starPos.x - pos.x
      const dy = starPos.y - pos.y
      const distSq = dx * dx + dy * dy
      const dist = Math.sqrt(distSq)
      if (dist < 5) continue

      const force = G * body.mass() / distSq
      body.applyForce(
        new RAPIER.Vector2(force * dx / dist, force * dy / dist),
        true,
      )
    }
  }

  // ── Input ──────────────────────────────────────────────────────────

  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()))
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))

  function applyShipControls() {
    const shipBody = bodies[1].body
    const thrustForce = 200
    const rotForce = 50

    const angle = shipBody.rotation()
    const fx = -Math.sin(angle)
    const fy = Math.cos(angle)

    if (keys.has('w') || keys.has('arrowup')) {
      shipBody.applyForce(
        new RAPIER.Vector2(fx * thrustForce, fy * thrustForce),
        true,
      )
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      shipBody.applyForce(
        new RAPIER.Vector2(-fx * thrustForce * 0.5, -fy * thrustForce * 0.5),
        true,
      )
    }
    if (keys.has('a') || keys.has('arrowleft')) {
      shipBody.applyTorque(-rotForce, true)
    }
    if (keys.has('d') || keys.has('arrowright')) {
      shipBody.applyTorque(rotForce, true)
    }
  }

  // ── Game loop ──────────────────────────────────────────────────────

  function tick() {
    applyGravity()
    applyShipControls()

    world.step()

    // Camera follows ship
    const shipPos = bodies[1].body.translation()
    camX = shipPos.x
    camY = shipPos.y

    // Render
    const w = app.screen.width
    const h = app.screen.height

    gfx.clear()

    for (const info of bodies) {
      const pos = info.body.translation()
      const rot = info.body.rotation()

      const sx = w / 2 + (pos.x - camX) * zoom
      const sy = h / 2 - (pos.y - camY) * zoom  // Y-flip

      if (info.shape === 'circle') {
        gfx.circle(sx, sy, (info.radius ?? info.halfW) * zoom)
          .fill(info.color)
      } else {
        // Rotated box
        gfx.save()
        gfx.translate(sx, sy)
        gfx.rotate(-rot)  // negate for screen Y-flip
        gfx.rect(-info.halfW * zoom, -info.halfH * zoom,
                  info.halfW * 2 * zoom, info.halfH * 2 * zoom)
          .fill(info.color)
        gfx.restore()
      }
    }

    // HUD
    const hudCanvas = document.getElementById('hud') as HTMLCanvasElement
    hudCanvas.width = w
    hudCanvas.height = h
    const ctx = hudCanvas.getContext('2d')!
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#aaa'
    ctx.font = '14px monospace'
    ctx.fillText(`Rigid Space - Rapier2D proof of concept`, 10, 20)
    ctx.fillText(`Bodies: ${bodies.length}  |  WASD: fly  |  Physics: Rapier2D WASM`, 10, 40)
    const shipVel = bodies[1].body.linvel()
    const speed = Math.sqrt(shipVel.x * shipVel.x + shipVel.y * shipVel.y)
    ctx.fillText(`Speed: ${speed.toFixed(0)}`, 10, 60)

    requestAnimationFrame(tick)
  }

  tick()
}

main()
