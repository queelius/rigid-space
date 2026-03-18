import { GridComposite } from './grid-composite'
import { Type } from './types'

/** Convert RGB to HSL */
export function hslFromRGB(r: number, g: number, b: number): [number, number, number] {
  const r1 = r / 255, g1 = g / 255, b1 = b / 255
  const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r1) h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) * 60
  else if (max === g1) h = ((b1 - r1) / d + 2) * 60
  else h = ((r1 - g1) / d + 4) * 60
  return [h, s, l]
}

export function hueFromRGB(r: number, g: number, b: number): number {
  return hslFromRGB(r, g, b)[0]
}

/** Default hue-band type map (non-overlapping ranges) */
export function defaultTypeMap(r: number, g: number, b: number): Type {
  const [h, s, l] = hslFromRGB(r, g, b)
  if (l < 0.1) return Type.BLACKHOLE
  if (s < 0.15) return Type.IRON
  if (h >= 200 && h <= 250) return Type.WATER
  if (h >= 0 && h < 25) return Type.LAVA
  if (h >= 335) return Type.LAVA  // wrap-around reds
  if (h >= 90 && h <= 150) return Type.PLANT
  if (h >= 25 && h < 40) return Type.ROCK
  if (h >= 40 && h < 65) return Type.SAND
  return Type.ROCK
}

/** Create a GridComposite from image data */
export function compositeFromImage(
  img: ImageData,
  typeMap: (r: number, g: number, b: number) => Type | null = defaultTypeMap,
): GridComposite {
  const grid = new GridComposite(img.width, img.height)
  const colors = grid.initColors()
  const data = img.data

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      if (a < 128) continue

      const type = typeMap(r, g, b)
      if (type === null) continue

      grid.set(x, y, type)
      colors[y * img.width + x] = (r << 16) | (g << 8) | b
    }
  }

  return grid
}
