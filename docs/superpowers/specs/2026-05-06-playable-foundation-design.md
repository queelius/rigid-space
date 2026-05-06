# Playable Foundation: Design Spec

**Date:** 2026-05-06
**Scope:** Transform the Rapier-wired tech demo into a stock playable game foundation: SC2-feel ship, event-driven audio, three-state menu stack, minimum visual feedback. Textures, weapons, damage, music, and settings are explicitly deferred to follow-up specs.

## Summary

The current `main.ts` boots straight into a playing world with a hard-to-fly ship, no menus, no audio, and rectangle-only graphics. This spec replaces it with: a `MainMenu` → `GameHUD` → `PauseMenu` screen-stack flow; SC2-style ship feel via Rapier `linearDamping=0` / `angularDamping=5` plus a post-step `maxSpeed` clamp; an event-driven audio path that wires the existing `EventBus` and `SoundEngine` (config-driven event subscription, Rapier `EventQueue` for collisions, continuous thrust loop, proximity ambient via registry metadata); and three "feel multiplier" visual additions (frame-rate-independent camera follow, COLLISION-triggered camera shake, thruster glow drawn behind the ship).

The design preserves all existing infrastructure (`ScreenStack`, `EventBus`, `BodyRegistry`, `Ship`, `BodyRenderer` interface, `GameLoop`, `InputManager`, `SoundEngine`, YAML config). New code is additive: six new files, four file modifications, no deletions. After this spec, the user can boot the game, navigate a title screen, fly with weighty-but-tight controls, hear collision/thrust/ambient sound, pause cleanly, and return to the title: the minimum loop a player would call "a game."

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope split | Single "playability pass" spec (feel + audio + menus); textures separate | Three subsystems are tightly coupled by the boot/state lifecycle but textures are independent polish |
| Ship feel mechanism | Rapier `linearDamping`/`angularDamping` + post-step `linvel` clamp | Idiomatic Rapier; frame-rate independent; `linvel` clamp is the only way to get a hard speed ceiling |
| Damping asymmetry | `linearDamping=0`, `angularDamping=5` | SC2 feel: drift forever in space, but rotation snaps to halt for precise aiming |
| Audio subscription | `SoundEngine.subscribeTo(bus)` derives handlers from `Object.keys(config.events)` | Adding event types becomes a YAML-only change; no parallel lookup tables |
| Collision events | Rapier `EventQueue` drained post-step; energy = `0.5*(m1+m2)*relSpeed`; threshold from `gameplay.yaml` | Standard Rapier pattern; energy gate filters trivial bumps |
| Proximity ambient | Data-driven via `RegistryEntry.metadata.proximityKey` | Adding new ambient sources (black hole) is a one-line metadata field |
| Audio init | Lazy: `new SoundEngine()` at module load, `init()` in MainMenu Start handler | Browser autoplay policy requires user gesture before AudioContext can play |
| Menu pattern | One `ScreenState` class per menu under `src/game/states/` | Matches existing `ScreenStack` design; testable in isolation |
| Boot route | `MainMenu` first; `?dev=1` URL flag skips to playing for fast iteration | Fresh players need a title; iteration shouldn't pay click-to-start cost on every reload |
| Menu input | Keyboard only (arrows + Enter + Esc) for MVP | Mouse requires broadening `ScreenState` interface; defer to UX pass |
| `spawnComposite` signature | Refactor to trailing options object | Already 8 positional params; adding 3 more is unworkable |
| Lifecycle | `enterPlaying(ctx)` / `exitToMainMenu(ctx)` as paired functions in `lifecycle.ts` | Keeps `main.ts` thin; "Quit to Main" becomes one call |
| Camera | New `Camera` class replaces inline `{x,y,zoom}` on `GameContext` | Adds smoothing + shake; frame-rate-independent lerp |
| Visual polish | Camera smoothing + shake + thruster glow only | Each is tiny but high-impact for "feel"; particles/debris are separate polish pass |

## Module Map

### Files to Create

| File | Purpose | Approx LOC |
|------|---------|------------|
| `src/game/lifecycle.ts` | `enterPlaying(ctx)` and `exitToMainMenu(ctx)`: spawn/despawn world bodies, push/pop screen states | ~80 |
| `src/game/camera.ts` | `Camera` class: target follow with frame-rate-independent lerp + shake decay | ~60 |
| `src/game/collision-events.ts` | `drainCollisionEvents()`: drains Rapier `EventQueue`, computes impact energy, emits `COLLISION` events on `EventBus` | ~50 |
| `src/game/states/main-menu.ts` | `MainMenu` ScreenState (Start / Quit) | ~80 |
| `src/game/states/game-hud.ts` | `GameHUD` ScreenState (non-pausing overlay; speed, position, controls hint; pushes PauseMenu on Esc) | ~70 |
| `src/game/states/pause-menu.ts` | `PauseMenu` ScreenState (Resume / Quit to Main) | ~70 |

### Files to Modify

| File | Change |
|------|--------|
| `src/main.ts` | Becomes thin bootstrap: init Rapier/Pixi/config, build context with empty world, register input dispatch, push `MainMenu` (or call `bootDevMode` if `?dev=1`), start loop. World population moves into `lifecycle.ts`. The inline `renderHUD` is removed; `GameHUD` state replaces it. |
| `src/game/ship.ts` | Add `maxSpeed: number`, `clampSpeed()`, `isThrusting()`, private `_thrusting` field. `applyControls()` updates `_thrusting` first. Apply `linearDamping`/`angularDamping` via `RigidBodyDesc` at spawn (in `lifecycle.ts`, not in Ship constructor, since Ship doesn't own its body desc). |
| `src/engine/rigid-spawn.ts` | Replace positional `kinematic?` param with trailing options object: `{ kinematic?, linearDamping?, angularDamping?, enableCollisionEvents? }`. When `enableCollisionEvents` is true, each `ColliderDesc` gets `.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)`. |
| `src/engine/body-registry.ts` | Add `findByBody(body): RegistryEntry \| undefined` (O(N) scan; small N). Add optional `metadata?: { proximityKey?: string; radius?: number }` field on `RegistryEntry`. `add()` signature becomes `add(tag: string, spawned: SpawnedBody, metadata?: RegistryEntry['metadata']): number`. |
| `src/render/body-renderer.ts` | `renderBodies(registry, camera, ship?)`, last param optional. Read `camera.effectiveX/Y` instead of `camera.x/y`. After drawing all bodies, if `ship?.isThrusting()`, draw translucent orange ellipse behind ship body. |
| `src/game/game-context.ts` | Replace `camera: { x, y, zoom }` with `camera: Camera`. Add `soundEngine: SoundEngine`, `eventQueue: RAPIER.EventQueue`. Make `ship: Ship \| undefined` (only set during play). Add `app: Application`, `hudCanvas: HTMLCanvasElement` fields so lifecycle helpers can access them. |
| `src/game/game-loop.ts` | No code change. Confirm `render(alpha)` callback receives interpolation; consider extending to `render(alpha, dt)` for camera precision (optional, see Section 4 risk #2). |
| `src/engine/events.ts` | Extend `GameEvent` type comment to document the convention: `tags?: string[]` is the optional field for body-tag-bearing events like `COLLISION`. No code change. |
| `src/game/sound.ts` | Add `subscribeTo(bus: EventBus): void` method (config-driven event subscription per Section 3). Throw if called before `init()`. |
| `public/assets/config/gameplay.yaml` | Add `ship.max_speed: 250`, `ship.linear_damping: 0`, `ship.angular_damping: 5`, `ship.reverse_thrust_factor: 0.5`. Raise `ship.thrust_strength` 500→2000 and `ship.rotation_rate` 12→40 as starting points (final values from empirical tuning per Section 2). |
| `src/config/loader.ts` | Add the new `ship` fields to `GameplayShipConfig` interface. |
| `index.html` | No change required; `#hud` canvas already exists with correct z-order. Confirm `pointer-events: none` on `#hud` so it doesn't block clicks (currently set in inline CSS). |

### Files to Delete

None.

### Files Untouched (deferred port material)

`src/game/builder.ts`, `trade.ts`, `quests.ts`, `npc.ts`, `stargate.ts`, `drivecore.ts`; `src/engine/gate-composite.ts`, `image-import.ts`; `src/game/states/builder.ts`, `trade-menu.ts`, `npc-dialog.ts`, `minimap.ts`, `jump-transition.ts`. These remain ported but unwired; future specs will integrate them.

## Subsystem Designs

### Ship feel

**Mechanism.** Configure the ship's `RigidBodyDesc` at spawn with `setLinearDamping(0)` and `setAngularDamping(5)`. After `world.step()` in `fixedUpdate`, call `ship.clampSpeed()` which scales `body.linvel()` down to `maxSpeed` if its magnitude exceeds it. Reverse thrust runs at half power (existing behavior, now config-driven via `reverse_thrust_factor`).

**`Ship` API additions.**

```typescript
class Ship {
  // existing
  readonly registryId: number
  readonly spawned: SpawnedBody
  thrustStrength: number
  rotationRate: number
  // new
  maxSpeed: number
  reverseThrustFactor: number
  private _thrusting = false

  // new methods
  clampSpeed(): void {
    const v = this.spawned.body.linvel()
    const mag = Math.sqrt(v.x * v.x + v.y * v.y)
    if (mag > this.maxSpeed) {
      const k = this.maxSpeed / mag
      this.spawned.body.setLinvel(new RAPIER.Vector2(v.x * k, v.y * k), true)
    }
  }
  isThrusting(): boolean { return this._thrusting }

  // modified: applyControls now sets _thrusting first
  applyControls(input: InputManager): void {
    this._thrusting = input.isAction('thrust_forward') || input.isAction('thrust_backward')
    // ... existing force/torque logic, with reverseThrustFactor in place of hardcoded 0.5
  }
}
```

**Damping config flow.** `lifecycle.ts::enterPlaying` reads `config.gameplay.ship.{linear_damping, angular_damping, max_speed, reverse_thrust_factor}` and passes to `spawnComposite` opts and to the `Ship` constructor. The `Ship` constructor signature gains the new fields.

**Tuning targets** (acceptance criteria, not formulas; implementer adjusts to hit these):
- Time to reach top speed from rest, full forward thrust: 5–8 seconds
- Time to fully rotate 360° from rest, holding turn key: 2.5–3.5 seconds
- Time for rotation to stop after key release (90% decay): under 0.5 seconds
- Drift loss when thrust released for 5 seconds at top speed: essentially zero

**Spawn position.** Ship spawns at `(500, 0)` with zero initial velocity. At `r = 500` with `G = 50000`, gravitational pull is ~0.003 units/s². The gentle inward drift gives the player ~10 seconds to orient before drift becomes meaningful.

**`spawnComposite` refactor.** Old signature `(world, grid, x, y, vx, vy, cellScale, kinematic?)` becomes `(world, grid, x, y, vx, vy, cellScale, opts?)` where opts is `{ kinematic?, linearDamping?, angularDamping?, enableCollisionEvents? }`. All three callsites (star, ship, asteroid) are updated in the same change.

### Audio wiring

**Subscription pattern.** `SoundEngine.subscribeTo(bus)` derives handlers from config:

```typescript
subscribeTo(bus: EventBus): void {
  if (!this.config) throw new Error('init() must run before subscribeTo()')
  for (const eventType of Object.keys(this.config.events)) {
    bus.on(eventType, e => this.playEvent(
      eventType,
      e.x,
      e.y,
      e.energy as number | undefined,
    ))
  }
}
```

**Collision events.** `src/game/collision-events.ts` exports `drainCollisionEvents(world, queue, registry, events, threshold)`. Called immediately after `world.step(eventQueue)`:

```typescript
queue.drainCollisionEvents((h1, h2, started) => {
  if (!started) return
  const c1 = world.getCollider(h1), c2 = world.getCollider(h2)
  const b1 = c1?.parent(), b2 = c2?.parent()
  if (!b1 || !b2) return

  const v1 = b1.linvel(), v2 = b2.linvel()
  const dvx = v1.x - v2.x, dvy = v1.y - v2.y
  const relSpeed = Math.sqrt(dvx * dvx + dvy * dvy)
  const energy = 0.5 * (b1.mass() + b2.mass()) * relSpeed
  if (energy < threshold) return

  const t1 = b1.translation(), t2 = b2.translation()
  const tag1 = registry.findByBody(b1)?.tag
  const tag2 = registry.findByBody(b2)?.tag
  events.emit({
    type: 'COLLISION',
    x: (t1.x + t2.x) * 0.5,
    y: (t1.y + t2.y) * 0.5,
    energy,
    tags: [tag1, tag2],
  })
})
```

`threshold` reads from `gameplay.yaml`'s existing `collision.event_threshold: 100`.

**Per-tick audio updates** (in `fixedUpdate`, after `clampSpeed`):

```typescript
const sp = ship.position()
soundEngine.shipX = sp.x; soundEngine.shipY = sp.y
soundEngine.setContinuous('thrust', ship.isThrusting())
for (const entry of registry) {
  const meta = entry.metadata
  if (!meta?.proximityKey) continue
  const ep = entry.spawned.body.translation()
  const dx = ep.x - sp.x, dy = ep.y - sp.y
  soundEngine.updateProximity(
    meta.proximityKey,
    Math.sqrt(dx * dx + dy * dy),
    entry.spawned.body.mass(),
    meta.radius,
  )
}
```

These four calls live in a small helper `updateAudio(ctx)` in `lifecycle.ts` (or a new `audio.ts`; implementer's call).

**Star metadata.** In `enterPlaying`, the star registry add becomes:
```typescript
registry.add('star', starSpawned, { proximityKey: 'star', radius: 50 })
```

**Audio init lifecycle.**

| Phase | Where | Action |
|-------|-------|--------|
| Module load | `main.ts` | `new SoundEngine()` (constructor only, no AudioContext yet) |
| User clicks Start | `MainMenu.handleKey('enter')` on Start | `soundEngine.init(config.sounds)` (creates AudioContext under user gesture) → `soundEngine.subscribeTo(eventBus)` → `enterPlaying(ctx)` |
| Quit to main | `PauseMenu` on Quit | `soundEngine.setContinuous('thrust', false)`. AudioContext stays alive, so re-entering Play doesn't need re-init |
| Dev mode (`?dev=1`) | `bootDevMode(ctx)` | Register one-time keydown listener that calls `soundEngine.init()` + `subscribeTo()` then removes itself; immediately call `enterPlaying(ctx)` |
| Tab close | (browser) | AudioContext garbage-collected with the tab |

**Camera shake.** `main.ts` registers one global `COLLISION` listener that shakes camera only when ship is involved:

```typescript
ctx.events.on('COLLISION', e => {
  if (!(e.tags as string[] | undefined)?.includes('ship')) return
  ctx.camera.shake(Math.min((e.energy as number) / 500, 1.0))
})
```

**MVP event scope.**
- *Emitted in this spec:* `COLLISION`
- *Defined in `sounds.yaml` but not yet emitted:* `CANNON_FIRE`, `BOND_BREAK`, `ERUPTION`, `ACCRETION` (deferred, since emitter systems don't exist yet; `subscribeTo` already handles them when their emitters land)
- *Continuous:* `thrust`
- *Proximity:* `star` (and `blackhole` config exists, will activate when a black hole spawns)

### Menu stack

**`MainMenu` (`pausesPhysics: true`).** Renders title + two options (`Start`, `Quit`). Keyboard navigation: ArrowUp/W and ArrowDown/S move `selectedIndex` (modular, so it wraps). Enter/Space activates. On Start: calls `soundEngine.init()`, `soundEngine.subscribeTo(events)`, pops self, calls `enterPlaying(ctx)`. On Quit: calls `window.close()` (best-effort; browsers may ignore).

**`GameHUD` (`pausesPhysics: false`).** Sits at the bottom of the stack during play. Renders: `"Rigid Space  |  WASD: fly  |  Esc: pause"`, `"Speed: <current> / <max>"`, `"Pos: x, y"`, `"Bodies: N"`. `handleKey('escape')` pushes `PauseMenu(ctx)` and returns true.

**`PauseMenu` (`pausesPhysics: true`).** Renders semi-transparent dark overlay (`rgba(0,0,0,0.6)` fillRect over full canvas) plus "PAUSED" title and two options (`Resume`, `Quit to Main`). Esc pops self. Enter on Resume pops self. Enter on Quit calls `exitToMainMenu(ctx)`.

**Selection rendering.** All menu states use the same convention: selected option prefixed with `▸ ` and rendered in `#ffdd44`; unselected in `#aaa`. Centered text via `c2d.textAlign = 'center'`.

**Render canvas.** All menu states render to the `#hud` Canvas2D context, which is `pointer-events: none` so it doesn't block input on `#game`. Stack render order: bottom-up (so `PauseMenu` overlay draws over `GameHUD`).

### Lifecycle (`src/game/lifecycle.ts`)

```typescript
export function enterPlaying(ctx: GameContext): void {
  // 1. Spawn star (1x1 EXOTIC, kinematic) via spawnComposite, then:
  //      a. Remove the auto-generated cuboid collider for cell "0,0"
  //      b. Create a ball(50) collider on the star body with
  //         .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
  //         so ship-vs-star bumps fire COLLISION events
  //      c. Delete "0,0" key from spawned.colliderMap (star has no per-cell damage)
  //    registry.add('star', spawned, { proximityKey: 'star', radius: 50 })
  // 2. Spawn ship at (500, 0): 3x5 grid, dynamic, cellScale=10
  //    spawnComposite opts: { linearDamping: 0, angularDamping: 5, enableCollisionEvents: true }
  //    ctx.ship = new Ship(id, spawned, config.gameplay.ship)
  // 3. Spawn 20 asteroids: same opts as ship for collision events
  // 4. ctx.screenStack.push(new GameHUD(ctx))
}

export function exitToMainMenu(ctx: GameContext): void {
  // 1. Pop screen stack until empty (pop GameHUD, pop PauseMenu if present)
  // 2. ctx.soundEngine.setContinuous('thrust', false)
  // 3. For each registry entry: ctx.registry.remove(ctx.rapierWorld, entry.id)
  // 4. ctx.ship = undefined
  // 5. ctx.camera reset: ctx.camera.x = ctx.camera.y = 0; ctx.camera.setTarget(0, 0)
  // 6. ctx.screenStack.push(new MainMenu(ctx))
}

export function bootDevMode(ctx: GameContext): void {
  // 1. enterPlaying(ctx)
  // 2. Register one-time keydown listener:
  //      const onFirstKey = () => {
  //        ctx.soundEngine.init(ctx.config.sounds)
  //        ctx.soundEngine.subscribeTo(ctx.events)
  //        window.removeEventListener('keydown', onFirstKey)
  //      }
  //      window.addEventListener('keydown', onFirstKey)
}
```

### Visual polish

**`Camera` (`src/game/camera.ts`).**

```typescript
export class Camera {
  x = 0; y = 0; zoom = 1
  private tx = 0; private ty = 0
  private smoothing = 8                 // higher = snappier; tunable
  private shakeMag = 0
  private shakeDecay = 5                // 1/seconds
  private shakeOX = 0; private shakeOY = 0

  setTarget(x: number, y: number): void { this.tx = x; this.ty = y }

  update(dt: number): void {
    // Frame-rate-independent exponential lerp
    const k = 1 - Math.exp(-this.smoothing * dt)
    this.x += (this.tx - this.x) * k
    this.y += (this.ty - this.y) * k

    // Shake decay
    this.shakeMag *= Math.exp(-this.shakeDecay * dt)
    if (this.shakeMag < 0.01) {
      this.shakeMag = 0; this.shakeOX = 0; this.shakeOY = 0
    } else {
      this.shakeOX = (Math.random() - 0.5) * 2 * this.shakeMag * 10
      this.shakeOY = (Math.random() - 0.5) * 2 * this.shakeMag * 10
    }
  }

  shake(magnitude: number): void { this.shakeMag = Math.max(this.shakeMag, magnitude) }

  get effectiveX(): number { return this.x + this.shakeOX }
  get effectiveY(): number { return this.y + this.shakeOY }
}
```

`Camera.update(dt)` runs in the loop's `render` callback (camera is purely visual, not part of physics). Renderer reads `effectiveX/Y`, not `x/y`.

**Thruster glow.** `GraphicsBodyRenderer.renderBodies(registry, camera, ship?)`, last param optional. After the existing per-body draw loop:

```typescript
if (ship?.isThrusting()) {
  const sp = ship.position()
  const sx = w / 2 + (sp.x - camera.effectiveX) * zoom
  const sy = h / 2 - (sp.y - camera.effectiveY) * zoom
  const angle = ship.rotation()
  const offset = 25 * zoom
  // glow sits opposite to thrust direction (behind ship)
  this.gfx.ellipse(sx + Math.sin(angle) * offset, sy - Math.cos(angle) * offset,
                   12 * zoom, 20 * zoom)
          .fill({ color: 0xff8833, alpha: 0.6 })
}
```

The glow is a single PixiJS draw call: negligible cost.

### Boot flow (`src/main.ts`)

```typescript
async function main() {
  await RAPIER.init()
  const config = await loadConfig()
  applyTypeConfig(config.types)

  const app = new Application()
  await app.init({ canvas: document.getElementById('game') as HTMLCanvasElement,
                   resizeTo: window, backgroundColor: 0x050510,
                   antialias: true, preference: 'webgl' })

  const hudCanvas = document.getElementById('hud') as HTMLCanvasElement

  // Build context (empty world)
  const ctx = createContext(app, hudCanvas, config)
  await ctx.input.loadConfig()

  // Input dispatch: ScreenStack first (consumes navigation), then InputManager (gameplay polling)
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase()
    if (ctx.screenStack.handleKey(key)) e.preventDefault()
    ctx.input.handleKeyDown(e)
  })
  window.addEventListener('keyup', e => ctx.input.handleKeyUp(e))

  // Camera shake on ship-involved collisions
  ctx.events.on('COLLISION', e => {
    if (!(e.tags as string[] | undefined)?.includes('ship')) return
    ctx.camera.shake(Math.min((e.energy as number) / 500, 1.0))
  })

  // Boot route
  const dev = new URLSearchParams(location.search).has('dev')
  if (dev) bootDevMode(ctx)
  else ctx.screenStack.push(new MainMenu(ctx))

  // Game loop
  createGameLoop(config.gameplay.physics.timestep, {
    fixedUpdate(dt) {
      if (!ctx.screenStack.paused && ctx.ship) {
        ctx.ship.applyControls(ctx.input)
        applyGravity(ctx.registry, 50000, 'star')
        ctx.rapierWorld.step(ctx.eventQueue)
        drainCollisionEvents(ctx.rapierWorld, ctx.eventQueue, ctx.registry,
                             ctx.events, config.gameplay.collision.event_threshold)
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
      if (hudCanvas.width !== app.screen.width) hudCanvas.width = app.screen.width
      if (hudCanvas.height !== app.screen.height) hudCanvas.height = app.screen.height
      c2d.clearRect(0, 0, hudCanvas.width, hudCanvas.height)
      ctx.screenStack.render(c2d, hudCanvas.width, hudCanvas.height)
    },
  }).start()
}

main()
```

`createContext` is a small helper in `lifecycle.ts` (or a new `bootstrap.ts`) that constructs the empty `GameContext`.

## Testing Strategy

### Unit tests (vitest, no DOM, no Rapier WASM)

| Module | Tests |
|--------|-------|
| `Camera` | `update()` lerps toward target across multiple ticks; `shake()` decays exponentially; `shake()` takes max of current and new magnitude; verify same final position at `dt=1/30` over 30 ticks vs `dt=1/144` over 144 ticks (frame-rate independence) |
| `MainMenu` | ArrowUp/Down navigation wraps around `options` array; Enter on Start triggers `soundEngine.init` + `subscribeTo` + `enterPlaying`; Enter on Quit calls `window.close`; non-handled keys return false |
| `PauseMenu` | Esc pops self; Enter on Resume pops self; Enter on Quit calls `exitToMainMenu`; arrow nav wraps |
| `GameHUD` | Esc pushes `PauseMenu` on stack; non-Esc keys return false |
| `BodyRegistry.findByBody` | returns matching entry; returns undefined for unknown body |
| `lifecycle.enterPlaying` | populates registry with `star + ship + 20 asteroids`; pushes `GameHUD`; sets `ctx.ship` |
| `lifecycle.exitToMainMenu` | clears registry to empty; sets `ctx.ship = undefined`; resets camera; pushes `MainMenu` |
| `SoundEngine.subscribeTo` | throws if called before `init`; registers one handler per `config.events` key |

Menu states are tested with a minimal mock `GameContext` (just the fields they touch: `screenStack`, `events`, `soundEngine`, `config`, plus stubs for `enterPlaying`/`exitToMainMenu` injected via constructor or imported with vi.mock).

### Integration tests (need `await RAPIER.init()`)

| Test | Verifies |
|------|----------|
| `Ship.clampSpeed` | Set linvel above max, call `clampSpeed`, verify magnitude equals max within 0.01 |
| `spawnComposite` opts | `linearDamping`, `angularDamping`, `enableCollisionEvents` propagate (read back via body methods and collider event flags) |
| `drainCollisionEvents` | Given a high-energy contact, emit fires once with correct energy, position midpoint, and tags; below-threshold contacts produce no event; resolve tags via `registry.findByBody` |
| ScreenStack pause routing | With stack `[GameHUD, PauseMenu]`, `paused === true`; with `[GameHUD]` only, `paused === false` |

### Deferred (manual smoke / future E2E)

- Boot → MainMenu → Start → Playing → Esc → Pause → Quit → MainMenu (Playwright-grade)
- Audio actually emitting through speakers (would need synthetic-context inspection)
- Visual look of thruster glow, camera shake, smoothing (subjective / playtesting)

Manual smoke checklist for the implementer:
1. `npx vite` → page loads → MainMenu visible
2. Arrow + Enter on Start → world appears, ship at rest near star, ambient drone audible
3. Hold W → ship accelerates, thruster glow visible, thrust loop audible
4. Bump asteroid → camera shakes, thump audible
5. Esc → pause overlay, world frozen, ambient audio continues but thrust loop silent
6. Esc again → resume seamlessly
7. Pause → Quit to Main → return to title; world cleared
8. Start again → fresh world spawns; no audio re-init needed
9. Reload with `?dev=1` → world appears immediately (no MainMenu); first WASD press unlocks audio

## Risks / Open Questions

1. **Empirical tuning required.** Starting values for `thrust_strength=2000`, `rotation_rate=40`, `angular_damping=5`, `max_speed=250`, shake-magnitude divisor `500`, and `Camera.smoothing=8` are educated guesses. Implementer must adjust to hit the Section "Tuning targets" before declaring done. Budget 1–2 hours of fly-the-ship-and-tweak.

2. **Camera dt approximation.** `camera.update(1/60)` in the render callback uses a fixed dt. Real frame dt would be slightly more accurate; threading it through `GameLoopCallbacks.render(alpha, dt?)` is a small refactor if precision matters. Likely not worth it: visual smoothing tolerates approximate dt.

3. **Multiple simultaneous proximity sources.** `SoundEngine.updateProximity()` keeps a single ambient gain shared across calls. If two proximity sources update in the same tick (e.g., star + black hole both nearby), the last call wins. For MVP only the star is a proximity source. Document as known limitation; revisit when blackhole spawning lands in a future spec.

4. **`window.close()` in MainMenu Quit.** Browsers ignore `window.close()` for windows not opened via script. Best-effort behavior is fine; the user can close the tab. Could replace with a "Quit" that clears the canvas to a "Thanks for playing" screen, but that's out of scope.

5. **AudioContext stays alive across Quit-to-Main.** Intentional: avoids requiring a re-init gesture on next Start. AudioContext is cheap when idle. If profiling later shows it matters, add `soundEngine.suspend()` / `resume()` to the lifecycle.

6. **Quit-to-Main mid-collision-handler.** If a `COLLISION` event fires synchronously and the handler runs after `exitToMainMenu` has cleared the registry, `Camera.shake` is harmless (just sets a magnitude on an unwatched camera). No crash; accept.

7. **`ctx.ship` becomes nullable.** This is a real change to `GameContext`'s contract. All references to `ctx.ship` outside the `if (ctx.ship)` guard in `fixedUpdate` need to handle `undefined`. The only such reference is in the `render` callback, which uses `?.` and a default. No other callsites currently exist (Builder etc. are unwired).

8. **First-keydown audio init in dev mode races with InputManager.** The dev-mode handler unlocks audio on first keydown but doesn't consume the event. InputManager also receives that keydown and starts thrusting if it was W. Acceptable, since the user wanted to fly anyway. Mentioned only because it's surprising if you trace through.

## Out of Scope (explicitly deferred to follow-up specs)

- **Textures / sprites.** `BodyRenderer` interface stays; a future `SpriteBodyRenderer` swaps in. Composites get baked to OffscreenCanvas → PixiJS Sprite.
- **Music / score.** Separate audio pass; needs actual tracks (Suno or licensed).
- **Settings menu.** Volume sliders, keybinding rebind UI. Adds real UI complexity.
- **Death / GameOver state.** Requires hull damage system (Rapier compound bodies losing colliders), which is its own design conversation.
- **Mouse input on menus.** Broadens `ScreenState` interface; defer to UX pass.
- **Weapons / projectiles.** Cannon config exists; emitter system doesn't.
- **Particle systems.** Debris, sparks, exhaust trails. Polish pass after textures.
- **Multiple ship classes / variants.** Single ship grid for MVP.
- **Save / load / persistent progression.** Not relevant to a sandbox MVP.
- **Builder / Trade / NPC integration.** Ports exist; future specs wire them in.
