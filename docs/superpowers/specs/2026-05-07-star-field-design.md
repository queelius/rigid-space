# Star Field Background: Design Spec

**Date:** 2026-05-07
**Scope:** Phase 1 of the post-foundation roadmap. Add a parallax star field as a non-interactive background layer, rendered behind world bodies.

## Summary

Create a `StarField` class that generates a deterministic seeded star configuration (80 far + 30 near stars in a 2000x2000 tile) and renders them per frame to a PixiJS `Graphics` object using parallax-adjusted camera offset with seamless wrap. Far layer at parallax 0.05 (slow scroll, dim white-ish), near layer at parallax 0.2 (faster scroll, color-varied). Distribution: 70% white, 10% blue tint, 10% yellow tint, 10% red tint. Sizes 0.5 to 1.5px (far) and 1.0 to 2.5px (near). Alpha 0.3 to 0.7 (far) and 0.5 to 1.0 (near). The star Graphics is added to `app.stage` at index 0 so it renders behind the body Graphics.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layer count | 2 (far + near) | Minimum for parallax illusion; cheap to render |
| Tile size | 2000x2000 world units | Must be >= max supported screen dim (1920); larger = sparser feel |
| Parallax model | offset only (no zoom scaling) | Stars feel "infinitely far"; simpler math |
| Star count | 80 far + 30 near | Yields ~10-30 visible per layer at 1920x1080 |
| Color distribution | 70/10/10/10 white/blue/yellow/red | Reads as more atmospheric than pure white |
| Wrap technique | per-star modulo into [-TILE/2, TILE/2) | One pass per star, seamless without multiple draws |
| Star ownership of Graphics | external (caller owns Graphics) | Keeps StarField testable without PixiJS |
| Determinism | seeded RNG (default 0xC0FFEE) | Stable layout across runs, testable |
| Background color | unchanged | Existing `0x050510` is already correct void blue |
| Camera coords | `effectiveX/effectiveY` (shake-adjusted) | Stars shake with camera, like the world |

## Module Map

### Files to create

| File | Purpose | Approx LOC |
|------|---------|------------|
| `src/render/star-field.ts` | `StarField` class with deterministic generation and per-frame render | ~120 |
| `src/render/star-field.test.ts` | Tests: determinism, count, bounds, modCentered math, off-screen culling, render call sequence | ~120 |

### Files to modify

| File | Change |
|------|--------|
| `src/main.ts` | Create `Graphics` for stars, attach at `app.stage.addChildAt(_, 0)`, construct `StarField`, call `starField.render(starGfx, camera, w, h)` in render callback before `renderer.renderBodies(...)`. |

## API

```typescript
export interface Star {
  x: number      // tile-space, [0, TILE)
  y: number      // tile-space, [0, TILE)
  size: number   // pixel radius
  color: number  // hex 0xRRGGBB
  alpha: number  // 0..1
}

export interface StarFieldOptions {
  farCount?: number   // default 80
  nearCount?: number  // default 30
  seed?: number       // default 0xC0FFEE
}

export class StarField {
  readonly far: readonly Star[]
  readonly near: readonly Star[]

  constructor(opts?: StarFieldOptions)
  render(gfx: Graphics, camera: Camera, screenWidth: number, screenHeight: number): void
}
```

`StarField` does NOT own a `Graphics` instance. Caller creates it, attaches it to the stage at the desired z-order, and passes it to `render()` each frame.

## Math

Constants:
- `TILE_SIZE = 2000`
- `FAR_PARALLAX = 0.05`
- `NEAR_PARALLAX = 0.2`

Helper:
```typescript
function modCentered(x: number, m: number): number {
  // wraps x into [-m/2, +m/2)
  return (((x + m / 2) % m) + m) % m - m / 2
}
```

Per-frame render (per layer):
```typescript
const camX = camera.effectiveX * parallax
const camY = camera.effectiveY * parallax

gfx.clear()  // call once total, before both layers

for (const star of layerStars) {
  const dx = modCentered(star.x - camX, TILE_SIZE)
  const dy = modCentered(star.y - camY, TILE_SIZE)
  const screenX = dx + screenWidth / 2
  const screenY = -dy + screenHeight / 2     // Y-flip for screen Y-down

  if (screenX < -2 || screenX > screenWidth + 2) continue
  if (screenY < -2 || screenY > screenHeight + 2) continue

  gfx.circle(screenX, screenY, star.size).fill({ color: star.color, alpha: star.alpha })
}
```

Y-flip aligns with `body-renderer.ts`: when `camera.effectiveY` increases (ship moves up in world), `-dy` becomes more positive, so stars appear to move DOWN on screen. Same as bodies, just at parallax speed.

## Color distribution

```typescript
function pickStarColor(r: number): number {
  if (r < 0.7) return 0xFFFFFF  // white
  if (r < 0.8) return 0xCCCCFF  // blue (hot stars)
  if (r < 0.9) return 0xFFFFCC  // yellow (sun-like)
  return 0xFFCCCC               // red (cool stars)
}
```

`r` is from the same seeded RNG used for position/size.

## Seeded RNG

Use Mulberry32 (compact, deterministic, no external dependency):
```typescript
function makeRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

## Tests

1. **Determinism**: two `StarField` with same seed produce identical first far star (x, y, size, color, alpha).
2. **Count defaults**: `farCount === 80`, `nearCount === 30`.
3. **Custom counts**: passing `farCount: 100` produces 100 far stars.
4. **Stars in tile bounds**: every star has `0 <= x < 2000` and `0 <= y < 2000`.
5. **Color distribution**: with seed and 1000 stars, each color appears within +/- 10% of expected ratio.
6. **modCentered correctness**: input 0 → 0; input 1500 (TILE=2000) → -500; input -500 → -500; input 999 → 999; input 1001 → -999.
7. **Render clears first**: mock Graphics records `clear` as first call.
8. **Render culls off-screen**: at camera position (10,000, 10,000), most stars are off the 800x600 screen and not drawn (verify circle call count is well under total star count).
9. **Render at origin draws all near-center stars**: at camera (0, 0) with screen 4000x4000 (larger than tile), every star is drawn (no culling).
10. **Each circle is followed by a fill**: verify call sequence (alternating circle, fill).

Mock Graphics:
```typescript
function makeMockGraphics() {
  const calls: { method: string; args: unknown[] }[] = []
  const obj = {
    clear: () => { calls.push({ method: 'clear', args: [] }); return obj },
    circle: (x: number, y: number, r: number) => { calls.push({ method: 'circle', args: [x, y, r] }); return obj },
    fill: (style: unknown) => { calls.push({ method: 'fill', args: [style] }); return obj },
  }
  return { obj, calls }
}
```

Cast as `unknown as Graphics` when passing to `render`.

## main.ts integration

Add imports:
```typescript
import { Graphics } from 'pixi.js'
import { StarField } from './render/star-field'
```

After `app.init` and before `new GraphicsBodyRenderer(app)`:
```typescript
const starGfx = new Graphics()
app.stage.addChildAt(starGfx, 0)
const starField = new StarField()
```

In the render callback, before `renderer.renderBodies(...)`:
```typescript
starField.render(starGfx, ctx.camera, app.screen.width, app.screen.height)
```

## Risks / open questions

1. **TILE_SIZE assumes screen <= 2000px in either dimension.** True for typical desktops up to 1920x1080. If a user has a 4K display rendered at full resolution (3840x2160), the wrapping math needs TILE >= 4000. Acceptable v1 limitation; bump TILE if it becomes a problem.

2. **Static density across the tile.** Stars are uniformly distributed. Real space has clusters and voids. Future work: seed clusters. Out of scope for v1.

3. **No twinkle animation.** Stars are static (apart from parallax scroll). A small alpha modulation (sine wave) per star would add atmosphere. Out of scope; trivial follow-up.

4. **Performance at large screen sizes.** 110 stars * 2 method calls each = 220 PixiJS operations per frame in the worst case. Negligible. If 4K becomes a concern, the constant-time culling in render keeps cost bounded by visible stars only.

5. **Camera zoom is ignored.** Stars don't scale or shift with `camera.zoom`. This is correct for "infinitely far" feel, but it means zooming in won't reveal more detail in the star field. Phase 2 (zoom + minimap) does not need to touch StarField unless we want stars to feel less distant when zoomed in (they probably should not).

## Out of scope (deferred)

- Twinkle / pulse animation.
- Star clusters / nebula patches.
- Rendering stars as a baked Texture/Sprite (instead of redrawn Graphics each frame). 110 circles per frame is cheap enough that this is unjustified.
- Distant galaxies / colored gas clouds.
