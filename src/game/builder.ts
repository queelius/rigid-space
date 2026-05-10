import { Type, typeProps } from '../engine/types'
import { GridComposite, Direction } from '../engine/grid-composite'
import { compositeFromImage } from '../engine/image-import'

export type BuilderMode = 'ship' | 'create'
export type DeployMode = 'none' | 'placing'

/** Render style for the composite */
export type CellShape = 'square' | 'round'

/** Template preset definition for CREATE mode */
export interface Template {
  label: string
  width: number
  height: number
  shape: CellShape
  cellScale: number  // world units per grid cell when deployed
}

export const TEMPLATES: Template[] = [
  { label: 'Ship 9\u00d713',      width: 9,  height: 13, shape: 'square', cellScale: 12 },
  { label: 'Station 13\u00d713',  width: 13, height: 13, shape: 'square', cellScale: 8 },
  { label: 'Asteroid 7\u00d77',   width: 7,  height: 7,  shape: 'round',  cellScale: 8 },
  { label: 'Planet 21\u00d721',   width: 21, height: 21, shape: 'round',  cellScale: 20 },
  { label: 'Custom...',           width: 0,  height: 0,  shape: 'square', cellScale: 10 },
]

export interface ShipStats {
  totalMass: number
  cellCount: number
  fuelCount: number
  emitterCount: number
  cockpitCount: number
  hasCockpit: boolean
  thrustToWeight: number  // emitterCount / totalMass (rough)
}

export function computeShipStats(grid: GridComposite): ShipStats {
  let totalMass = 0, cellCount = 0, fuelCount = 0, emitterCount = 0, cockpitCount = 0
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.get(x, y)
      if (!cell) continue
      cellCount++
      totalMass += typeProps(cell.type).defaultMass
      if (cell.type === Type.FUEL) fuelCount++
      if (cell.type === Type.EMITTER) emitterCount++
      if (cell.type === Type.COCKPIT) cockpitCount++
    }
  }
  return {
    totalMass, cellCount, fuelCount, emitterCount, cockpitCount,
    hasCockpit: cockpitCount > 0,
    thrustToWeight: totalMass > 0 ? emitterCount / totalMass : 0,
  }
}

/** Ship builder mode -- edit a GridComposite, then spawn into world */
export class Builder {
  active = false
  mode: BuilderMode = 'ship'
  deployMode: DeployMode = 'none'
  cellShape: CellShape = 'square'
  deployCellScale = 12
  /** How the composite is deployed: 'rigid' (single rep particle), 'spawned' (bonds, gravity skip), 'full' (bonds, full physics) */
  deployCompositeType: 'rigid' | 'spawned' | 'full' = 'full'
  /** Zoom multiplier for the builder grid view (1 = fit to screen, 2 = 2x, etc.) */
  builderZoom = 1
  grid: GridComposite
  selectedType: Type = Type.IRON
  selectedFacing: Direction = Direction.UP
  /** Persists palette selection across BuilderState sessions; written by BuilderState's [/] handlers. */
  paletteIndex = 0
  inventory: Map<number, number> = new Map()

  /** Stashed ship grid when switching to CREATE mode */
  private _shipGrid: GridComposite | null = null

  /** Dev mode: unlimited inventory, extra features */
  devMode = false

  /** Hidden file input for blueprint loading */
  private _fileInput: HTMLInputElement | null = null

  constructor() {
    this.grid = new GridComposite(9, 13)  // max ship size
    // Infinite inventory in builder (building should be unconstrained)
    this._enableDevInventory()
    // Check URL params for dev mode
    this.devMode = new URLSearchParams(window.location.search).has('dev')
    if (this.devMode) {
      this._enableDevInventory()
    }
  }

  /** Fill all types with effectively infinite inventory */
  private _enableDevInventory(): void {
    for (let t = 0; t < Type.COUNT; t++) {
      this.inventory.set(t, 99999)
    }
  }

  /** Toggle build mode on/off */
  toggle(): void {
    this.active = !this.active
  }

  /** Switch to CREATE mode with a template size */
  startCreate(templateWidth: number, templateHeight: number, shape: CellShape = 'square', cellScale = 12): void {
    if (this.mode === 'ship') {
      this._shipGrid = this.grid
    }
    this.mode = 'create'
    this.cellShape = shape
    this.deployCellScale = cellScale
    this.grid = new GridComposite(templateWidth, templateHeight)
    if (this.devMode) this._enableDevInventory()
  }

  /** Switch to SHIP EDIT mode (restores stashed ship grid) */
  startShipEdit(shipGrid: GridComposite): void {
    this.mode = 'ship'
    this.grid = shipGrid
  }

  /** Get the stashed ship grid (used when switching back to ship mode) */
  getStashedShipGrid(): GridComposite | null {
    return this._shipGrid
  }

  /** Enter placement mode (user clicks world to deploy) */
  startPlacement(): void {
    this.deployMode = 'placing'
    this.active = false  // exit grid editor, show the world
  }

  /** Cancel placement mode */
  cancelPlacement(): void {
    this.deployMode = 'none'
  }

  /** Check if the create-mode grid has any cells filled */
  hasAnyCells(): boolean {
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        if (this.grid.get(x, y)) return true
      }
    }
    return false
  }

  /** Place a cell at grid position using selectedType + selectedFacing */
  placeCell(gx: number, gy: number): void {
    if (gx < 0 || gx >= this.grid.width || gy < 0 || gy >= this.grid.height) return

    // If cell already occupied, do nothing
    if (this.grid.get(gx, gy)) return

    this.grid.set(gx, gy, this.selectedType, this.selectedFacing)
  }

  /** Remove a cell, returning its material to inventory */
  removeCell(gx: number, gy: number): void {
    const cell = this.grid.get(gx, gy)
    if (!cell) return

    if (!this.devMode) {
      this.inventory.set(cell.type, (this.inventory.get(cell.type) ?? 0) + 1)
    }
    this.grid.clear(gx, gy)
  }

  /** Rotate selected facing: UP -> RIGHT -> DOWN -> LEFT -> UP */
  rotateFacing(): void {
    this.selectedFacing = ((this.selectedFacing + 1) % 4) as Direction
  }

  /** Select type by enum value */
  selectType(type: Type): void {
    if (type >= 0 && type < Type.COUNT) {
      this.selectedType = type
    }
  }

  /** Get the GridComposite (for spawning) */
  getGrid(): GridComposite {
    return this.grid
  }

  /** Get bond start -- always -1 since bonds are auto-generated by the grid */
  getBondStart(): number {
    return -1
  }

  /** Adjust grid size (dev mode only) */
  adjustGridSize(dw: number, dh: number): void {
    const newW = Math.max(3, this.grid.width + dw)
    const newH = Math.max(3, this.grid.height + dh)
    if (newW === this.grid.width && newH === this.grid.height) return

    const newGrid = new GridComposite(newW, newH)
    // Copy existing cells that fit
    for (let y = 0; y < Math.min(this.grid.height, newH); y++) {
      for (let x = 0; x < Math.min(this.grid.width, newW); x++) {
        const cell = this.grid.get(x, y)
        if (cell) newGrid.set(x, y, cell.type, cell.facing)
      }
    }
    this.grid = newGrid
  }

  /** Save current grid as downloadable JSON blueprint */
  saveBlueprint(name: string): void {
    const json = JSON.stringify(this.grid.toJSON(), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Load blueprint from file */
  async loadBlueprint(file: File): Promise<void> {
    const text = await file.text()
    const data = JSON.parse(text)
    this.grid = GridComposite.fromJSON(data)
  }

  /** Trigger file input dialog for loading a blueprint */
  triggerLoad(): void {
    if (!this._fileInput) {
      this._fileInput = document.createElement('input')
      this._fileInput.type = 'file'
      this._fileInput.accept = '.json'
      this._fileInput.style.display = 'none'
      document.body.appendChild(this._fileInput)
      this._fileInput.addEventListener('change', () => {
        const file = this._fileInput?.files?.[0]
        if (file) {
          this.loadBlueprint(file)
        }
      })
    }
    this._fileInput.click()
  }

  /** Import an image file as a grid composite */
  async importImage(file: File): Promise<void> {
    const img = new Image()
    const url = URL.createObjectURL(file)
    return new Promise((resolve, reject) => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, img.width, img.height)
        URL.revokeObjectURL(url)
        this.grid = compositeFromImage(imageData)
        this.cellShape = 'round'
        resolve()
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
      img.src = url
    })
  }

  /** Trigger file input for image import */
  triggerImageImport(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (file) this.importImage(file)
      document.body.removeChild(input)
    })
    input.click()
  }

  /** Clear all cells from the grid */
  clearGrid(): void {
    this.grid = new GridComposite(this.grid.width, this.grid.height)
  }

  /** Mirror the grid left-to-right (around vertical center) */
  mirrorHorizontal(): void {
    const w = this.grid.width
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < Math.floor(w / 2); x++) {
        const cell = this.grid.get(x, y)
        if (cell) {
          let mirrorFacing = cell.facing
          // Flip LEFT<->RIGHT facing
          if (cell.facing === Direction.LEFT) mirrorFacing = Direction.RIGHT
          else if (cell.facing === Direction.RIGHT) mirrorFacing = Direction.LEFT
          this.grid.set(w - 1 - x, y, cell.type, mirrorFacing)
        }
      }
    }
  }
}
