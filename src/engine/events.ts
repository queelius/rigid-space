export interface GameEvent {
  type: string
  x: number
  y: number
  [key: string]: unknown
}

type Handler = (event: GameEvent) => void

export class EventBus {
  private handlers = new Map<string, Handler[]>()

  on(type: string, handler: Handler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, [])
    this.handlers.get(type)!.push(handler)
  }

  emit(event: GameEvent): void {
    const handlers = this.handlers.get(event.type)
    if (handlers) {
      for (const h of handlers) h(event)
    }
  }

  off(type: string, handler: Handler): void {
    const handlers = this.handlers.get(type)
    if (handlers) {
      const idx = handlers.indexOf(handler)
      if (idx >= 0) handlers.splice(idx, 1)
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
