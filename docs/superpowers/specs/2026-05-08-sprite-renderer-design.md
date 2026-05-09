# Sprite Renderer + Texture Baking: Design Spec

**Date:** 2026-05-08
**Scope:** Phase 3 of the post-foundation roadmap. Replace immediate-mode rectangle rendering with sprite-based rendering. Bodies bake to textures at spawn time; per-frame work drops to position + rotation updates.

## Summary

Create `SpriteBodyRenderer` implementing the existing `BodyRenderer` interface. On `onBodyAdded`, bake the body's grid composite into an `OffscreenCanvas`, convert to a PixiJS `Texture`, create a `Sprite`, and add it to a shared `worldContainer`. The container handles camera transformation via PixiJS's `position` / `pivot` / `scale` (replacing the current per-cell screen math). Star bodies get a procedural radial-gradient texture instead of a baked grid. Thruster glow stays inside this renderer, drawn each frame in the world container so it scales with zoom. `main.ts` swaps the renderer one-line: `new GraphicsBodyRenderer(app)` to `new SpriteBodyRenderer(app)`. The old immediate-mode renderer is deleted.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Texture baking | OffscreenCanvas to PixiJS Texture | Standard pattern; one-time cost at spawn |
| Lazy vs pre-bake | Lazy in `onBodyAdded` | No startup cost; bodies bake on demand |
| Cell rendering | Flat fill, sharp edges | Matches current GraphicsBodyRenderer aesthetic, pixel-art feel |
| Star rendering | Procedural radial gradient (bright yellow center to transparent edge) | Looks like a glowing star; no PNG asset needed |
| Star texture caching | One shared texture per radius | Stars share visual; no need to re-bake per body |
| Y orientation | Manual sprite-Y flip (sprite.y = -body.y) | Texture stays right-side-up in image previews; per-frame code is just two assignments |
| Camera transform | Container `pivot` (cx, -cy), `position` (w/2, h/2), `scale` (zoom, zoom) | Idiomatic PixiJS; GPU does the math |
| Glow | Inside SpriteBodyRenderer, drawn last in worldContainer | Scales with zoom; shake propagates correctly |
| GraphicsBodyRenderer | Delete after migration | YAGNI; if sprite has bugs we revert via git |
| BodyRenderer interface | Unchanged | Sprite implementation drop-in for Graphics |

## Module Map

### Files to create

| File | Purpose | LOC |
|------|---------|-----|
| `src/render/sprite-body-renderer.ts` | `SpriteBodyRenderer` class implementing `BodyRenderer` | ~180 |
| `src/render/texture-bake.ts` | Pure helpers: bake dimensions, render cells to canvas, render star to canvas | ~100 |
| `src/render/texture-bake.test.ts` | Tests for the pure helpers | ~120 |

### Files to modify

| File | Change |
|------|--------|
| `src/main.ts` | Replace `new GraphicsBodyRenderer(app)` with `new SpriteBodyRenderer(app)`. Hook the lifecycle: call `renderer.onBodyAdded(entry)` whenever bodies are added in `lifecycle.spawnInitialWorld`, and call `onBodyRemoved(id)` from `lifecycle.despawnAll`. (Currently neither is called; the existing Graphics renderer ignored both.) |
| `src/game/lifecycle.ts` | After each `registry.add(...)`, call `ctx.renderer.onBodyAdded(entry)`. In `despawnAll`, before `registry.remove(...)`, call `ctx.renderer.onBodyRemoved(entry.id)`. |
| `src/game/lifecycle.test.ts` | Mock the renderer methods on the test ctx (currently `renderer: null as never`); verify `onBodyAdded` is called once per spawn. |

### Files to delete

| File | Reason |
|------|--------|
| `src/render/body-renderer.ts` (the `GraphicsBodyRenderer` class only) | Replaced by `SpriteBodyRenderer`. Keep the `BodyRenderer` interface and `RegistryEntry` re-export. Move them to `src/render/body-renderer.ts` (interface only) or to a new file. |

Actually: keep `src/render/body-renderer.ts` as the interface module; move `GraphicsBodyRenderer` out and delete it. The interface stays so consumers can import `BodyRenderer` without binding to a concrete class.

Plan: edit `src/render/body-renderer.ts` to remove the `GraphicsBodyRenderer` class and its TYPE_COLORS const, leaving only the `BodyRenderer` interface.

## API

```typescript
// src/render/texture-bake.ts

export interface BakeDimensions {
  canvasWidth: number    // px
  canvasHeight: number   // px
  anchorX: number        // 0..1
  anchorY: number        // 0..1
}

/** Compute canvas size and sprite anchor for a grid composite. */
export function computeGridBakeDimensions(
  grid: GridComposite,
  cellScale: number,
  com: { x: number; y: number },  // body-local COM (already computed by spawnComposite)
): BakeDimensions

/** Render filled cells to a 2D canvas context. Cells drawn flat-filled. */
export function renderGridToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  grid: GridComposite,
  cellScale: number,
): void

/** Render a procedural star (radial gradient yellow disc) to a 2D canvas context. */
export function renderStarToCanvas(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  radius: number,  // px
): void
```

```typescript
// src/render/sprite-body-renderer.ts

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { BodyRenderer } from './body-renderer'
import type { BodyRegistry, RegistryEntry } from '../engine/body-registry'
import type { Camera } from '../game/camera'
import type { Ship } from '../game/ship'

export class SpriteBodyRenderer implements BodyRenderer {
  private app: Application
  private worldContainer: Container
  private glowGfx: Graphics
  private sprites: Map<number, Sprite>
  private starTexture: Texture | null  // cached
  // Optional: per-grid texture cache keyed by grid identity (skip for v1)

  constructor(app: Application)

  renderBodies(registry: BodyRegistry, camera: Camera, ship?: Ship): void
  onBodyAdded(entry: RegistryEntry): void
  onBodyRemoved(id: number): void
  resize(width: number, height: number): void
}
```

## Math

### Texture baking (grid composite)

Canvas dimensions: `grid.width * cellScale` by `grid.height * cellScale` pixels.

Cell at `(gx, gy)` is drawn as a filled rectangle:
- `top-left X = gx * cellScale`
- `top-left Y = (grid.height - 1 - gy) * cellScale`  (gy=0 cells render at canvas BOTTOM, so the texture preview shows the body right-side-up by image conventions)
- size: `cellScale x cellScale`
- color: `typeProps(cell.type).defaultColor` formatted as `'#RRGGBB'` from the integer hex

Anchor calculation (so `sprite.position` corresponds to body's COM):
- `canvasXofCOM = canvas.width / 2 + com.x`
- `canvasYofCOM = canvas.height / 2 - com.y`  (Y-flipped because canvas Y-down vs body-local Y-up)
- `anchor.x = canvasXofCOM / canvas.width`
- `anchor.y = canvasYofCOM / canvas.height`

Sketch in TypeScript:
```typescript
export function computeGridBakeDimensions(grid, cellScale, com) {
  const canvasWidth = grid.width * cellScale
  const canvasHeight = grid.height * cellScale
  const canvasXofCOM = canvasWidth / 2 + com.x
  const canvasYofCOM = canvasHeight / 2 - com.y
  return {
    canvasWidth,
    canvasHeight,
    anchorX: canvasXofCOM / canvasWidth,
    anchorY: canvasYofCOM / canvasHeight,
  }
}
```

### Texture baking (star)

Texture size: `2 * radius` square. For star radius 50, texture is 100x100 px.

Use Canvas2D radial gradient:
```typescript
const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius)
grad.addColorStop(0.0, 'rgba(255, 245, 180, 1.0)')   // bright pale yellow center
grad.addColorStop(0.3, 'rgba(255, 220, 100, 0.95)')
grad.addColorStop(0.7, 'rgba(255, 180, 40, 0.5)')
grad.addColorStop(1.0, 'rgba(255, 140, 20, 0.0)')    // transparent edge
ctx.fillStyle = grad
ctx.fillRect(0, 0, 2 * radius, 2 * radius)
```

Sprite anchor: `(0.5, 0.5)` (center). Sprite scale: `1` (texture is 1 px per world unit; the radius in metadata matches the bake radius).

### Camera transform via worldContainer

Per render frame:
```typescript
this.worldContainer.position.set(this.app.screen.width / 2, this.app.screen.height / 2)
this.worldContainer.pivot.set(camera.effectiveX, -camera.effectiveY)
this.worldContainer.scale.set(camera.zoom, camera.zoom)
```

This replaces the per-cell math in `GraphicsBodyRenderer.renderBodies`.

### Per-frame sprite update

For each entry in the registry, lookup `sprites.get(entry.id)`, then:
```typescript
const t = entry.spawned.body.translation()
sprite.position.set(t.x, -t.y)
sprite.rotation = entry.spawned.body.rotation()
```

Y is manually flipped on the sprite (so the texture stays right-side-up in image preview); rotation is direct because PixiJS positive rotation in Y-down screen space matches the visual direction we want.

### Glow

Inside `SpriteBodyRenderer.renderBodies`, after the per-sprite update loop, draw the thruster glow into `glowGfx` (which is added once to `worldContainer` so it transforms with the camera). Same math as the current renderer, but the position/rotation are read from `ship.position()` / `ship.rotation()`, with manual Y flip for the position:

```typescript
this.glowGfx.clear()
if (ship?.isThrusting()) {
  const sp = ship.position()
  const angle = ship.rotation()
  // Use the same screen-direction-of-thrust math as ship.ts (now corrected to sin/cos).
  // Glow sits opposite to thrust direction (behind ship).
  const offset = 25
  const gx = sp.x - Math.sin(angle) * offset
  const gy = -sp.y + Math.cos(angle) * offset    // Y-flip on container space
  // Width is along ship's local X axis (perpendicular to forward); height is along forward.
  // For a glow ellipse aligned with the ship, we draw it as a circle and scale via PixiJS Graphics?
  // Simpler: draw an ellipse at the glow position; PixiJS Graphics ellipse uses screen-axis-aligned
  // dimensions, so we want the long axis perpendicular to thrust direction.
  // For now match the existing renderer's behavior: 12x20 ellipse, axis-aligned, offset behind ship.
  this.glowGfx.ellipse(gx, gy, 12, 20).fill({ color: 0xff8833, alpha: 0.6 })
}
```

Note: the existing glow is axis-aligned (not rotated to match ship orientation). The current GraphicsBodyRenderer just draws an ellipse `12x20` with no rotation. We'll keep that behavior in v1; rotating the glow to match ship facing is a polish item for Phase 6 (shaders) or whenever glow gets more elaborate.

Wait, looking again at the existing renderer:
```typescript
this.gfx.ellipse(
  sx + Math.sin(angle) * offset,
  sy - Math.cos(angle) * offset,
  12 * zoom,
  20 * zoom,
).fill({ color: 0xff8833, alpha: 0.6 })
```

The existing code multiplies by zoom because it's drawing in screen coordinates. For the sprite version, since the glow is inside `worldContainer` which already scales by zoom, we drop the `* zoom` factors. The radii become `12` and `20` in world units (which becomes `12 * zoom` and `20 * zoom` pixels on screen, same as before).

The position offset also no longer needs `* zoom` because the container handles that. Keep `offset = 25` in world units.

## Lifecycle wiring

The current `lifecycle.spawnInitialWorld` calls `registry.add(...)` for star, ship, asteroids. The renderer's `onBodyAdded` hook is never called (Graphics renderer didn't need it). For the sprite renderer it's load-bearing.

Two options:
- **(A) Wire in lifecycle**: `registry.add` returns an id; immediately follow with `ctx.renderer.onBodyAdded(entry)` where `entry = registry.get(id)`.
- **(B) Wire in `BodyRegistry`**: have `add` notify a renderer reference. Tighter coupling; rejected.

Going with (A). Pseudocode in lifecycle.ts:
```typescript
const id = registry.add('star', spawned, { proximityKey: 'star', radius: 50 })
ctx.renderer.onBodyAdded(registry.get(id)!)
```

This is the only mechanical wiring change. `despawnAll` similarly calls `onBodyRemoved` before each `registry.remove`.

## Tests

### `texture-bake.test.ts` (pure helpers)

1. `computeGridBakeDimensions: canvas size matches grid extent`
   - 3x5 grid, cellScale 10 → canvasWidth 30, canvasHeight 50.
2. `computeGridBakeDimensions: anchor at center for COM at origin`
   - com `{x: 0, y: 0}` → anchor `(0.5, 0.5)`.
3. `computeGridBakeDimensions: anchor shifts with COM`
   - com `{x: 5, y: -3}`, canvas 30x50 → anchor `(0.5 + 5/30, 0.5 + 3/50)` = `(0.667, 0.56)`. (Note `+` because Y flip: canvasYofCOM = h/2 - comY.)
4. `renderGridToCanvas: writes correct number of fillRect calls`
   - 3x3 grid with 5 filled cells → 5 fillRect calls.
5. `renderGridToCanvas: cell at gy=0 lands at canvas bottom`
   - Single cell at `(0, 0)` in a 1x3 grid, cellScale 10 → fillRect at `(0, 20, 10, 10)`.
6. `renderGridToCanvas: cell at gy=2 in 3-tall lands at canvas top`
   - Single cell at `(0, 2)` in a 1x3 grid, cellScale 10 → fillRect at `(0, 0, 10, 10)`.
7. `renderGridToCanvas: uses cell color from typeProps`
   - Single cell of `Type.ROCK`, verify the `fillStyle` is set to ROCK's color before fillRect.
8. `renderStarToCanvas: creates radial gradient`
   - Mock context, verify `createRadialGradient` called with `(radius, radius, 0, radius, radius, radius)`.
9. `renderStarToCanvas: applies four color stops`
   - Verify mock gradient receives 4 `addColorStop` calls.
10. `renderStarToCanvas: fills full square`
    - Verify `fillRect` called with `(0, 0, 2*radius, 2*radius)`.

### lifecycle.test.ts (extension)

11. `spawnInitialWorld calls onBodyAdded for each spawned body`
    - Mock renderer with `onBodyAdded` spy; verify call count = 1 (star) + 1 (ship) + 20 (asteroids) = 22.
12. `despawnAll calls onBodyRemoved for each body`
    - After spawnInitialWorld then despawnAll, verify `onBodyRemoved` spy was called 22 times.

(SpriteBodyRenderer itself is not unit-tested in v1; integration is verified by manual smoke. The pure helpers cover the math, which is the only place subtle bugs hide.)

## main.ts integration

```diff
- import { GraphicsBodyRenderer } from './render/body-renderer'
+ import { SpriteBodyRenderer } from './render/sprite-body-renderer'

  // ...

-   renderer: new GraphicsBodyRenderer(app),
+   renderer: new SpriteBodyRenderer(app),
```

`main.ts` does NOT call `onBodyAdded` directly. That's `lifecycle.ts`'s job.

## Risks / open questions

1. **Sprite count scaling.** Each grid composite gets its own texture (no inter-body sharing). With ~22 bodies, this is fine. If procgen adds thousands of asteroids in Phase 5+, we'll want to share textures across same-shape bodies (hash the grid serialization, cache). Out of scope.

2. **Texture memory.** A 30x50 ship texture is ~6KB GPU memory. 20 small (10-30px) asteroid textures are ~2KB each. Total ~50KB. Negligible. Won't matter until thousands of unique textures.

3. **Star sprite scaling.** The radial gradient is baked at exactly the star's radius (100x100 px for radius 50). At zoom 4 the star appears 200px radius on screen, which is fine but the gradient's edge pixels become visible. Higher-resolution bake (e.g., 256x256 for radius 50) would address this. Defer; star's gradient hides aliasing well.

4. **Asteroid grids that get modified post-spawn.** If `removeCell` is called on an asteroid (Phase 5 combat), the texture is now stale. We need to re-bake on cell change. Add a renderer method `onBodyChanged(id)` for this; deferred to Phase 5 since combat hasn't landed yet. For Phase 3, asteroids never change shape after spawn.

5. **Glow not rotated to match ship.** The current ellipse is axis-aligned. After Phase 3 it stays axis-aligned (just inside the world container). Visually fine because the glow is small and roughly symmetric; if it becomes asymmetric or larger, we revisit.

6. **Y-flip per sprite vs container.** I chose per-sprite Y flip (sprite.y = -body.y) for two reasons: (a) texture preview shows the body right-side-up, useful for debugging, and (b) the per-frame code is symmetric (both sprite.x and sprite.y are simple assignments). Alternative (container scale.y = -1) would let `sprite.position.set(body.x, body.y)` directly, but the texture preview would be inverted and rotation would need a sign flip. Either choice is internally consistent.

7. **Camera dt approximation.** `camera.update(1/60)` in `main.ts` render callback hardcodes dt. With this phase the zoom lerp also runs at this rate. Documented as known limitation; defer.

## Out of scope (deferred)

- External PNG loading (planet/station sprites from `public/assets/generated/`). Phase 5 or whenever those bodies actually spawn.
- Texture atlas / sprite batching for many same-shape bodies.
- Glow rotation to match ship facing direction.
- Per-cell damage texture re-bake.
- Anti-aliasing or subpixel cell rendering.
- Animated sprites (frames per body, e.g., spinning asteroids).
- Lighting / shadowing from the star.
