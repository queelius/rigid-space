import yaml from 'js-yaml'

export type ActionFn = () => void

export interface KeybindingsConfig {
  keybindings: Record<string, string>
}

/**
 * Data-driven input manager. Maps keys to named actions.
 * Key assignments come from keybindings.yaml; action handlers are
 * registered by name from game code.
 */
export class InputManager {
  private keyActions: Map<string, ActionFn> = new Map()
  private keyHeld: Record<string, boolean> = {}

  // Reverse map: action name -> bound key (for isAction / display)
  private actionToKey: Map<string, string> = new Map()
  // Forward map: key -> action name (for dispatch)
  private keyToAction: Map<string, string> = new Map()

  /** Load keybindings from YAML config */
  async loadConfig(): Promise<void> {
    try {
      const text = await fetch('/assets/config/keybindings.yaml').then(r => r.text())
      const cfg = yaml.load(text) as KeybindingsConfig
      if (cfg?.keybindings) {
        for (const [action, key] of Object.entries(cfg.keybindings)) {
          this.actionToKey.set(action, key)
          this.keyToAction.set(key, action)
        }
      }
    } catch {
      // Fall back to defaults if config not available
      this._applyDefaults()
    }
  }

  /** Apply default keybindings (used as fallback) */
  private _applyDefaults(): void {
    const defaults: Record<string, string> = {
      thrust_forward: 'w',
      thrust_backward: 's',
      rotate_left: 'a',
      rotate_right: 'd',
      fire_cannon: ' ',
      orbit_lock: 'o',
      hyperspace: 'h',
      builder_toggle: 'b',
      interact: 't',
      zoom_in: '=',
      zoom_out: '-',
      minimap_toggle: 'm',
    }
    for (const [action, key] of Object.entries(defaults)) {
      this.actionToKey.set(action, key)
      this.keyToAction.set(key, action)
    }
  }

  /** Bind an action name to a callback. The key mapping comes from config. */
  bind(actionName: string, action: ActionFn): void {
    const key = this.actionToKey.get(actionName)
    if (key) {
      this.keyActions.set(key, action)
    }
  }

  /** Bind a raw key directly to an action (for keys not in the config, like Escape) */
  bindKey(key: string, action: ActionFn): void {
    this.keyActions.set(key, action)
  }

  /** Check if a key is currently held */
  isHeld(key: string): boolean {
    return !!this.keyHeld[key]
  }

  /** Check if the action's bound key is currently held */
  isAction(actionName: string): boolean {
    const key = this.actionToKey.get(actionName)
    if (!key) return false
    return !!this.keyHeld[key]
  }

  /** Get the key bound to an action name */
  getKey(actionName: string): string | undefined {
    return this.actionToKey.get(actionName)
  }

  handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase()
    this.keyHeld[key] = true
    this.keyHeld[e.code] = true

    // Try the lowercase key first, then the raw key
    const action = this.keyActions.get(key) ?? this.keyActions.get(e.key)
    if (action) {
      if (key === ' ') e.preventDefault()
      action()
    }
  }

  handleKeyUp(e: KeyboardEvent): void {
    this.keyHeld[e.key.toLowerCase()] = false
    this.keyHeld[e.code] = false
  }
}
