import yaml from 'js-yaml'

export type ActionFn = () => void

export interface KeybindingsConfig {
  keybindings: Record<string, string | string[]>
}

/**
 * Data-driven input manager. Maps keys to named actions.
 * Multiple keys can be bound to a single action (e.g., 'w' and 'arrowup' both
 * trigger 'thrust_forward'). Key assignments come from keybindings.yaml; action
 * handlers are registered by name from game code.
 */
export class InputManager {
  private keyActions: Map<string, ActionFn> = new Map()
  private keyHeld: Record<string, boolean> = {}

  // Action name -> bound keys (for isAction / display).
  private actionToKeys: Map<string, string[]> = new Map()
  // Key -> action name (for dispatch).
  private keyToAction: Map<string, string> = new Map()

  /** Load keybindings from YAML config. */
  async loadConfig(): Promise<void> {
    try {
      const text = await fetch('/assets/config/keybindings.yaml').then(r => r.text())
      const cfg = yaml.load(text) as KeybindingsConfig
      if (cfg?.keybindings) {
        for (const [action, value] of Object.entries(cfg.keybindings)) {
          const keys = Array.isArray(value) ? value : [value]
          this.actionToKeys.set(action, keys)
          for (const key of keys) {
            this.keyToAction.set(key, action)
          }
        }
      }
    } catch {
      // Fall back to defaults if config not available.
      this._applyDefaults()
    }
  }

  /** Apply default keybindings (used as fallback). */
  private _applyDefaults(): void {
    const defaults: Record<string, string | string[]> = {
      thrust_forward: ['w', 'arrowup'],
      thrust_backward: ['s', 'arrowdown'],
      rotate_left: ['a', 'arrowleft'],
      rotate_right: ['d', 'arrowright'],
      fire_cannon: ' ',
      orbit_lock: 'o',
      hyperspace: 'h',
      builder_toggle: 'b',
      interact: 't',
      zoom_in: '=',
      zoom_out: '-',
    }
    for (const [action, value] of Object.entries(defaults)) {
      const keys = Array.isArray(value) ? value : [value]
      this.actionToKeys.set(action, keys)
      for (const key of keys) {
        this.keyToAction.set(key, action)
      }
    }
  }

  /** Bind an action name to a callback. The key mapping comes from config. */
  bind(actionName: string, action: ActionFn): void {
    const keys = this.actionToKeys.get(actionName)
    if (keys) {
      for (const key of keys) {
        this.keyActions.set(key, action)
      }
    }
  }

  /** Bind a raw key directly to an action (for keys not in the config, like Escape). */
  bindKey(key: string, action: ActionFn): void {
    this.keyActions.set(key, action)
  }

  /** Check if a key is currently held. */
  isHeld(key: string): boolean {
    return !!this.keyHeld[key]
  }

  /** Check if any key bound to the named action is currently held. */
  isAction(actionName: string): boolean {
    const keys = this.actionToKeys.get(actionName)
    if (!keys) return false
    for (const key of keys) {
      if (this.keyHeld[key]) return true
    }
    return false
  }

  /** Get the first key bound to an action (for HUD/help text display). */
  getKey(actionName: string): string | undefined {
    const keys = this.actionToKeys.get(actionName)
    return keys?.[0]
  }

  handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase()
    this.keyHeld[key] = true
    this.keyHeld[e.code] = true

    // Try the lowercase key first, then the raw key.
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
