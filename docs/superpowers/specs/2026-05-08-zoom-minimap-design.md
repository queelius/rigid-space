# Camera Zoom + Minimap: Design Spec

**Date:** 2026-05-08
**Scope:** Phase 2 of the post-foundation roadmap. Add camera zoom (`=` / `-`) and a minimap overlay (toggleable with `M`) to the in-game HUD.

## Summary

Add `targetZoom` to the `Camera` class with smooth lerp (same exponential pattern as position follow). Bind `zoom_in` and `zoom_out` actions in the input loop to scale `targetZoom` by `Math.pow(2, dt)` per second held, clamped to `[0.25, 4.0]`. Create a new `Minimap` class that draws a 150x150 overlay in the top-right of the HUD canvas: semi-transparent dark background, gray border, ship as a green triangle facing its current rotation, star as a yellow circle, asteroids as gray dots. Minimap visibility lives on the `Minimap` instance; `GameHUD` toggles it on `M`. Existing stub `src/game/states/minimap.ts` is removed (it was a port from the old codebase that delegated to the renderer; in our architecture the HUD owns minimap rendering).

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Zoom controls | continuous while held | Matches feel of thrust/rotation controls |
| Zoom rate | `Math.pow(2, dt)` per second | Geometric scaling feels consistent at any zoom level |
| Zoom bounds | `[0.25, 4.0]` | 0.25x = ~whole system; 4x = ship fills 1/4 screen |
| Zoom smoothing | exponential lerp toward target | Same pattern as `Camera` position follow |
| Minimap rendering | inside `GameHUD` (Canvas2D) | HUD already owns the canvas context |
| Minimap viewmodel | extend `GameHUDViewModel` with `shipRotation()`, `bodies()` | Keeps pattern consistent |
| Minimap data shape | `MinimapBody { x, y, tag }` | Decoupled from `BodyRegistry` so `Minimap` testable without Rapier |
| Minimap centering | on ship (not camera) | Shake should not jitter the minimap |
| Minimap default state | visible | 150x150 footprint is small; range 1500 is informational |
| Existing `MinimapState` | delete | Stub from old port; obsolete in current architecture |

## Module Map

### Files to create

| File | Purpose | Approx LOC |
|------|---------|------------|
| `src/render/minimap.ts` | `Minimap` class with toggle and render | ~100 |
| `src/render/minimap.test.ts` | Tests: visibility toggle, body iteration, range clipping, ship triangle math | ~120 |

### Files to modify

| File | Change |
|------|--------|
| `src/game/camera.ts` | Add `targetZoom`, `zoomSmoothing`, `MIN_ZOOM`/`MAX_ZOOM` constants. Add `setTargetZoom(z)` (clamps) and `zoomBy(factor)` (multiplies + clamps). Modify `update(dt)` to lerp `zoom` toward `targetZoom`. |
| `src/game/camera.test.ts` | Add tests for `setTargetZoom` clamping, `zoomBy` multiplication and clamping, zoom lerps over time. |
| `src/game/states/game-hud.ts` | Extend `GameHUDViewModel` with `shipRotation()` and `bodies(): MinimapBody[]`. Constructor takes a `Minimap` instance. `handleKey('m')` toggles minimap. `render` calls `minimap.render(...)`. |
| `src/game/states/game-hud.test.ts` | Update existing tests for new viewmodel fields; add tests for `m` key toggle and minimap render delegation. |
| `src/main.ts` | In fixedUpdate, dispatch `zoom_in` / `zoom_out` to `ctx.camera.zoomBy(...)`. In `makeGameHUD`, construct a `Minimap` and pass it. Extend the viewmodel adapter with `shipRotation` and `bodies`. |

### Files to delete

| File | Reason |
|------|--------|
| `src/game/states/minimap.ts` | Stub from old port. Obsolete; functionality moves into `GameHUD`. |

## API

```typescript
// src/render/minimap.ts

export interface MinimapBody {
  x: number
  y: number
  tag: string
}

export interface MinimapOptions {
  size?: number      // default 150 (square, pixels)
  padding?: number   // default 10 (from screen edges)
  range?: number     // default 1500 (world units shown across the minimap)
  bgAlpha?: number   // default 0.4
}

export class Minimap {
  visible: boolean
  readonly size: number
  readonly padding: number
  readonly range: number

  constructor(opts?: MinimapOptions)
  toggle(): void

  render(
    c2d: CanvasRenderingContext2D,
    screenWidth: number,
    screenHeight: number,
    shipPos: { x: number; y: number },
    shipRot: number,
    bodies: MinimapBody[],
  ): void
}
```

```typescript
// src/game/camera.ts (additions)

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4.0

export class Camera {
  // existing: x, y, zoom, smoothing, shake stuff
  targetZoom: number
  zoomSmoothing: number  // default 8

  setTargetZoom(z: number): void  // clamps to [MIN_ZOOM, MAX_ZOOM]
  zoomBy(factor: number): void    // multiplies targetZoom and clamps
  // update(dt) now also lerps zoom toward targetZoom
}
```

```typescript
// src/game/states/game-hud.ts (updated viewmodel)

export interface GameHUDViewModel {
  bodyCount(): number
  shipSpeed(): number
  shipMaxSpeed(): number
  shipPosition(): { x: number; y: number }
  shipRotation(): number              // NEW
  bodies(): MinimapBody[]             // NEW
}
```

## Math

### Camera zoom

```typescript
update(dt: number): void {
  // existing: position lerp, shake decay
  // NEW: zoom lerp
  const k = 1 - Math.exp(-this.zoomSmoothing * dt)
  this.zoom += (this.targetZoom - this.zoom) * k
}

setTargetZoom(z: number): void {
  this.targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

zoomBy(factor: number): void {
  this.setTargetZoom(this.targetZoom * factor)
}
```

In `main.ts` fixedUpdate (gated on `!paused && ship`):
```typescript
if (ctx.input.isAction('zoom_in')) ctx.camera.zoomBy(Math.pow(2, dt))
if (ctx.input.isAction('zoom_out')) ctx.camera.zoomBy(Math.pow(0.5, dt))
```

### Minimap rendering

```typescript
render(c2d, screenWidth, screenHeight, shipPos, shipRot, bodies): void {
  if (!this.visible) return

  const x0 = screenWidth - this.size - this.padding   // top-right corner
  const y0 = this.padding
  const cx = x0 + this.size / 2
  const cy = y0 + this.size / 2
  const scale = this.size / this.range  // px per world unit

  // background + border
  c2d.fillStyle = `rgba(0, 0, 0, ${this.bgAlpha})`
  c2d.fillRect(x0, y0, this.size, this.size)
  c2d.strokeStyle = '#666'
  c2d.lineWidth = 1
  c2d.strokeRect(x0 + 0.5, y0 + 0.5, this.size - 1, this.size - 1)

  // bodies (skip ship, drawn last as triangle)
  for (const body of bodies) {
    if (body.tag === 'ship') continue
    const dx = (body.x - shipPos.x) * scale
    const dy = -(body.y - shipPos.y) * scale  // Y-flip for screen
    const sx = cx + dx
    const sy = cy + dy
    if (sx < x0 || sx > x0 + this.size || sy < y0 || sy > y0 + this.size) continue

    const { color, radius } = bodyMarkerStyle(body.tag)
    c2d.fillStyle = color
    c2d.beginPath()
    c2d.arc(sx, sy, radius, 0, Math.PI * 2)
    c2d.fill()
  }

  // ship triangle (centered, points in shipRot direction)
  // ship visual nose direction in screen coords matches what body-renderer does:
  // world (sin(rot), cos(rot)) -> screen (sin(rot), -cos(rot))
  const nx = Math.sin(shipRot)
  const ny = -Math.cos(shipRot)
  const tipLen = 7
  const baseLen = 4
  // Perpendicular for triangle base
  const px = -ny
  const py = nx
  const tipX = cx + nx * tipLen
  const tipY = cy + ny * tipLen
  const baseLX = cx - nx * 2 + px * baseLen
  const baseLY = cy - ny * 2 + py * baseLen
  const baseRX = cx - nx * 2 - px * baseLen
  const baseRY = cy - ny * 2 - py * baseLen
  c2d.fillStyle = '#22ff88'
  c2d.beginPath()
  c2d.moveTo(tipX, tipY)
  c2d.lineTo(baseLX, baseLY)
  c2d.lineTo(baseRX, baseRY)
  c2d.closePath()
  c2d.fill()
}

function bodyMarkerStyle(tag: string): { color: string; radius: number } {
  if (tag === 'star') return { color: '#ffdd44', radius: 4 }
  if (tag === 'asteroid') return { color: '#888888', radius: 1.5 }
  return { color: '#ccccff', radius: 1.5 }  // unknown tags
}
```

## Tests

### Camera (additions to camera.test.ts)

1. `setTargetZoom clamps below MIN_ZOOM`: setting `0.1` clamps to `0.25`.
2. `setTargetZoom clamps above MAX_ZOOM`: setting `10` clamps to `4.0`.
3. `zoomBy multiplies targetZoom`: starting at 1, `zoomBy(2)` -> targetZoom 2; `zoomBy(0.5)` -> 1.
4. `zoomBy respects clamp`: starting at 4, `zoomBy(2)` -> still 4 (clamped at MAX).
5. `update lerps zoom toward targetZoom`: set target to 2, run many `update(1/60)` calls, zoom approaches 2.

### Minimap (minimap.test.ts)

Use a mock Canvas2D context that records calls (similar pattern to the GameHUD render test added in Task 11 fix).

1. `toggle flips visible`.
2. `render no-ops when visible is false` (zero calls on c2d).
3. `render draws background + border` (verify fillRect and strokeRect calls).
4. `render draws ship triangle` (verify beginPath/moveTo/lineTo/closePath/fill sequence after background).
5. `render draws star as yellow circle` (input one body with tag 'star' near origin, verify a fill call with #ffdd44 color).
6. `render skips bodies outside range` (body 5000 units away with range 1500: not drawn).
7. `render skips ship body` (body with tag 'ship' is not drawn as a circle; the explicit triangle covers it).
8. `range option scales drawing` (custom range 3000: a body at 750 units appears at the edge instead of mid-minimap).
9. `size option changes square dimensions` (verify fillRect uses configured size).

### GameHUD (additions to game-hud.test.ts)

10. `M key toggles minimap visibility`.
11. `render delegates to minimap` (mock Minimap with spy on render method).

## main.ts integration

1. Add `import { Minimap } from './render/minimap'`.
2. In `makeGameHUD`, change to:
```typescript
function makeGameHUD(): GameHUD {
  const minimap = new Minimap()
  return new GameHUD(
    {
      bodyCount: () => ctx.registry.all().length,
      shipSpeed: () => ctx.ship?.speed() ?? 0,
      shipMaxSpeed: () => ctx.ship?.maxSpeed ?? 0,
      shipPosition: () => ctx.ship?.position() ?? { x: 0, y: 0 },
      shipRotation: () => ctx.ship?.rotation() ?? 0,
      bodies: () => ctx.registry.all().map(e => {
        const t = e.spawned.body.translation()
        return { x: t.x, y: t.y, tag: e.tag }
      }),
    },
    { onPause: pushPauseMenu },
    minimap,
  )
}
```
3. In fixedUpdate, after the existing `ship.applyControls`, add:
```typescript
if (ctx.input.isAction('zoom_in')) ctx.camera.zoomBy(Math.pow(2, dt))
if (ctx.input.isAction('zoom_out')) ctx.camera.zoomBy(Math.pow(0.5, dt))
```

## Risks / open questions

1. **Zoom interaction with star field**: stars don't scale with zoom (per Phase 1 spec). At high zoom, bodies will be much larger than stars, which reads as expected ("stars are infinitely far"). At very low zoom (0.25), bodies become small dots; star field still visible. Acceptable.

2. **Minimap centered on ship vs camera**: chose ship to avoid shake jitter. If the camera is being pulled by physics independently from the ship in the future (e.g., look-ahead), this decision can be revisited.

3. **Body limit on minimap**: with 22 bodies in v1, performance is irrelevant. If the world ever has thousands of bodies (procgen?), we may want spatial indexing or a body-count cap. Out of scope.

4. **Zoom vs camera shake interaction**: shake offset is in world units (`shakeMag * 10`). At high zoom, screen shake will appear larger. At low zoom, smaller. This is correct behavior (consistent with bodies scaling).

5. **Minimap visibility persists across enter/exit menu cycles**: `Minimap` is recreated in `makeGameHUD()` each enterPlaying call, so visibility resets to default true. Acceptable; if persistence is wanted later, lift the `Minimap` instance up to `GameContext`.

## Out of scope (deferred)

- Adaptive minimap range (auto-scaling based on camera zoom or system size).
- Stationary "north arrow" indicator on minimap.
- Click-to-pan camera via minimap (mouse interaction).
- Velocity vector arrow on minimap.
- Other tags (planet, station): rendered as the unknown-tag fallback (light blue dots) until those bodies actually spawn.
