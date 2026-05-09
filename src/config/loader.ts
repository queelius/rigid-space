import yaml from 'js-yaml'

export interface SoundLayerConfig {
  waveform: OscillatorType
  base_freq: number
  freq_range: number
  pulse_hz?: number
}

export interface ProximitySoundConfig {
  // Range as factor of computed object radius
  min_range_factor?: number   // below this: danger zone (full intensity)
  max_range_factor?: number   // beyond this: silence
  range_fallback?: number     // absolute fallback if radius unknown
  falloff: number             // exponent for distance falloff
  max_volume: number
  layers: SoundLayerConfig[]
  mass_scale?: { freq_mult: number; vol_mult: number }
  danger?: {
    max_volume: number
    layers: SoundLayerConfig[]
  }
}

export interface EventSoundConfig {
  type: 'synthetic' | 'file'
  waveform?: OscillatorType
  freq_start?: number
  freq_end?: number
  duration?: number
  src?: string
  volume: number
  range: number
}

export interface ContinuousSoundConfig {
  waveform: OscillatorType
  freq: number
  volume: number
  attack: number
  release: number
}

export interface SoundsConfig {
  proximity: Record<string, ProximitySoundConfig>
  events: Record<string, EventSoundConfig>
  continuous: Record<string, ContinuousSoundConfig>
}

export interface TypeConfig {
  mass: number
  bond_strength: number
  color: [number, number, number]
  radius_formula?: 'sqrt' | 'linear' | 'log'  // how to compute radius from mass
  radius_scale?: number                         // multiplier for radius formula
}

export interface TypesConfig {
  types: Record<string, TypeConfig>
}

export interface CentralBodyConfig {
  name: string
  type: string          // EXOTIC, BLACKHOLE, etc.
  mass: number
  heat?: number
  sound_override?: Partial<ProximitySoundConfig>
}

export interface SystemQuestConfig {
  id: string
  title: string
  description: string
  type: 'deliver' | 'collect' | 'destroy' | 'visit'
  target: string
  quantity: number
  reward_credits: number
  reward_items?: { type: string; count: number }[]
}

export interface SystemConfig {
  name: string
  central_body: CentralBodyConfig
  quests?: SystemQuestConfig[]
}

export interface SystemsConfig {
  systems: Record<string, SystemConfig>
}

// ── Procgen config ────────────────────────────────────────────────────

export interface ProcgenLayerConfig {
  material: string          // type name or 'surface' (uses the planet's surface type)
  radius_fraction: number
}

export interface EruptionConfig {
  interval: [number, number]
  particle_count: [number, number]
  particle_type: string
  speed: [number, number]
  spread: number
  heat: [number, number]
  mass: [number, number]
}

export interface VolcanoConfig {
  count: [number, number]
  hill_width: number
  tip_type: string
  eruption: EruptionConfig
}

export interface ProcgenPlanetConfig {
  layers: ProcgenLayerConfig[]
  volcano: VolcanoConfig
}

export interface FillTierConfig {
  distance_fraction: number
  probability: number
}

export interface ProcgenAsteroidConfig {
  fill_tiers: FillTierConfig[]
  iron_fraction: number
}

export interface ProcgenStationConfig {
  size: number
  patterns: string[]
  ring_radius: number
  center_type: string
  arm_type: string
  accent_type: string
}

export interface ProcgenConfig {
  planet: ProcgenPlanetConfig
  asteroid: ProcgenAsteroidConfig
  station: ProcgenStationConfig
}

// ── NPC config ───────────────────────────────────────────────────────

export interface NpcPoolConfig {
  names: string[]
  personalities: string[]
  default_inventory: string[]
}

export interface NpcsConfig {
  npc_pool: NpcPoolConfig
}

// ── Gameplay config ─────────────────────────────────────────────────

export interface GameplayShipCannonConfig {
  mass: number
  speed: number
}

export interface GameplayShipConfig {
  thrust_strength: number
  rotation_rate: number
  max_speed: number
  linear_damping: number
  angular_damping: number
  reverse_thrust_factor: number
  cannon: GameplayShipCannonConfig
}

export interface GameplayPhysicsConfig {
  substeps: number
  timestep: number
  gravity_constant: number
}

export interface GameplaySolarFlaresConfig {
  probability: number
  spawn_offset: number
  speed: [number, number]
  mass: number
  heat: number
  max_particles: number
}

export interface GameplayOrbitStabilizationConfig {
  station_blend: number
  default_blend: number
}

export interface GameplayCollisionConfig {
  restitution: number
  heat_fraction: number
  break_threshold: number
  event_threshold: number
}

export interface GameplayBlackholeConfig {
  accretion_radius_factor: number
  mass_absorption: number
  absorption_heat: number
  tidal_scale: number
  tidal_heat_scale: number
  drag: number
  dilation_range_factor: number
}

export interface GameplayThermalConfig {
  cooling_rate: number
  bond_damping: number
}

export interface GameplayDockingConfig {
  range: number
  max_velocity: number
  bond_stiffness: number
  bond_max_stress: number
}

export interface GameplayHyperspaceConfig {
  fuel_per_mass: number
  min_fuel: number
}

export interface GameplayConfig {
  ship: GameplayShipConfig
  physics: GameplayPhysicsConfig
  solar_flares: GameplaySolarFlaresConfig
  orbit_stabilization: GameplayOrbitStabilizationConfig
  thermal: GameplayThermalConfig
  collision: GameplayCollisionConfig
  blackhole: GameplayBlackholeConfig
  docking: GameplayDockingConfig
  hyperspace: GameplayHyperspaceConfig
}

// ── Visuals config ───────────────────────────────────────────────────

export interface VisualsBackgroundConfig {
  color: [number, number, number]
  star_count: number
  parallax_range: [number, number]
}

export interface VisualsCameraConfig {
  default_zoom: number
}

export interface VisualsParticlesConfig {
  min_render_size: number
  mass_threshold_circle: number
}

export interface VisualsTrailsConfig {
  speed_threshold: number
  max_length: number
  color: [number, number, number]
}

export interface VisualsShipMarkerConfig {
  ring_radii: [number, number]
  pulse_hz: number
  color: [number, number, number]
}

export interface VisualsStarConfig {
  corona_layers: number
  corona_colors: [number, number, number][]
  corona_alphas: number[]
  surface_spots: number
}

export interface VisualsBlackholeConfig {
  accretion_rings: number
  accretion_colors: [number, number, number][]
  photon_ring_color: [number, number, number]
  photon_ring_alpha: number
}

export interface VisualsHudConfig {
  font: string
  speed_max: number
  temp_max: number
}

export interface CellRenderingConfig {
  edge_color?: [number, number, number]
  edge_width?: number
  shine?: number
  pulse?: boolean
  pulse_hz?: number
  directional_glow?: boolean
  glow_color?: [number, number, number]
  window?: boolean
}

export interface ShaderConfig {
  enabled: boolean
  glsl: string
}

export interface VisualsConfig {
  background: VisualsBackgroundConfig
  camera: VisualsCameraConfig
  particles: VisualsParticlesConfig
  trails: VisualsTrailsConfig
  ship_marker: VisualsShipMarkerConfig
  star: VisualsStarConfig
  blackhole: VisualsBlackholeConfig
  hud: VisualsHudConfig
  cell_rendering: Record<string, CellRenderingConfig>
  shaders?: Record<string, ShaderConfig>
}

// ── GameConfig ────────────────────────────────────────────────────────

export interface GameConfig {
  sounds: SoundsConfig
  types: TypesConfig
  systems: SystemsConfig
  procgen: ProcgenConfig
  visuals: VisualsConfig
  npcs: NpcsConfig
  gameplay: GameplayConfig
}

// ── Hyperspace config ────────────────────────────────────────────────

export interface HyperspacePhysicsConfig {
  slipstream_drag: number
  void_drag: number
  slipstream_radius: number
  repulsive_G: number
  well_attraction_radius: number
  well_attraction_G: number
}

export interface HyperspaceEntryConfig {
  speed_threshold_fraction: number
  min_distance_from_star: number
  fuel_cost: number
}

export interface HyperspaceStructureConfig {
  name: string
  position: [number, number]
  asset: string
  npc_name: string
  npc_personality: string
}

export interface HyperspaceConfig {
  physics: HyperspacePhysicsConfig
  entry: HyperspaceEntryConfig
  coordinate_scale: number
  structures: HyperspaceStructureConfig[]
}

// ── Generated systems config ────────────────────────────────────────

export interface GeneratedBody {
  asset: string
  composite_type: 'rigid' | 'spawned' | 'spawned_full'
  cell_scale: number
  orbit_radius: number
  orbit_parent?: number
  spin_rate: number
}

export interface GeneratedSystem {
  name: string
  central_body: { type: string; mass: number; heat: number }
  bodies: GeneratedBody[]
  connections?: string[]   // keys of other systems (hardcoded or generated) to connect to
  gx?: number              // galaxy map x coordinate
  gy?: number              // galaxy map y coordinate
}

export interface GeneratedSystemsConfig {
  systems: Record<string, GeneratedSystem>
}

let _generatedSystems: GeneratedSystemsConfig = { systems: {} }

let _hyperspaceConfig: HyperspaceConfig | null = null

let _config: GameConfig | null = null

export async function loadConfig(): Promise<GameConfig> {
  if (_config) return _config

  const [soundsText, typesText, systemsText, procgenText, visualsText, npcsText, gameplayText, generatedText, hyperspaceText] = await Promise.all([
    fetch('/assets/config/sounds.yaml').then(r => r.text()),
    fetch('/assets/config/types.yaml').then(r => r.text()),
    fetch('/assets/config/systems.yaml').then(r => r.text()),
    fetch('/assets/config/procgen.yaml').then(r => r.text()),
    fetch('/assets/config/visuals.yaml').then(r => r.text()),
    fetch('/assets/config/npcs.yaml').then(r => r.text()),
    fetch('/assets/config/gameplay.yaml').then(r => r.text()),
    fetch('/assets/config/generated-systems.yaml').then(r => r.ok ? r.text() : '').catch(() => ''),
    fetch('/assets/config/hyperspace.yaml').then(r => r.ok ? r.text() : '').catch(() => ''),
  ])

  const sounds = yaml.load(soundsText) as SoundsConfig
  const types = yaml.load(typesText) as TypesConfig
  const systems = yaml.load(systemsText) as SystemsConfig
  const procgen = yaml.load(procgenText) as ProcgenConfig
  const visuals = yaml.load(visualsText) as VisualsConfig
  const npcs = yaml.load(npcsText) as NpcsConfig
  const gameplay = yaml.load(gameplayText) as GameplayConfig

  // Generated systems: may not exist or be empty, gracefully fall back
  if (generatedText) {
    const parsed = yaml.load(generatedText) as GeneratedSystemsConfig | null
    if (parsed?.systems) _generatedSystems = parsed
  }

  // Hyperspace config: may not exist, gracefully fall back
  if (hyperspaceText) {
    const parsed = yaml.load(hyperspaceText) as HyperspaceConfig | null
    if (parsed) _hyperspaceConfig = parsed
  }

  _config = { sounds, types, systems, procgen, visuals, npcs, gameplay }
  return _config
}

export function getConfig(): GameConfig {
  if (!_config) throw new Error('Config not loaded: call loadConfig() first')
  return _config
}

export function getGeneratedSystems(): GeneratedSystemsConfig {
  return _generatedSystems
}

export function getHyperspaceConfig(): HyperspaceConfig | null {
  return _hyperspaceConfig
}

/** Compute visual/physics radius for a particle based on its type config and actual mass */
export function computeRadius(typeConfig: TypeConfig, mass: number): number {
  const scale = typeConfig.radius_scale ?? 1.0
  switch (typeConfig.radius_formula) {
    case 'sqrt': return Math.sqrt(mass) * scale
    case 'log':  return Math.log(1 + mass) * scale
    case 'linear': return mass * scale
    default: return 2.0 + Math.log(1 + mass) * 1.5  // default visual formula
  }
}
