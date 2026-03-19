export interface GameLoopCallbacks {
  fixedUpdate(dt: number): void
  render(interpolation: number): void
}

export interface GameLoop {
  tick(dt: number): void
  start(): void
  stop(): void
}

export function createGameLoop(
  timestep: number,
  callbacks: GameLoopCallbacks,
): GameLoop {
  let accumulator = 0
  let rafId = 0
  let lastTime = 0
  const maxAccumulator = timestep * 5

  function tick(dt: number): void {
    accumulator += dt
    if (accumulator > maxAccumulator) {
      accumulator = maxAccumulator
    }

    while (accumulator >= timestep) {
      callbacks.fixedUpdate(timestep)
      accumulator -= timestep
    }

    callbacks.render(accumulator / timestep)
  }

  function frame(now: number): void {
    const dt = lastTime === 0 ? timestep : (now - lastTime) / 1000
    lastTime = now
    tick(dt)
    rafId = requestAnimationFrame(frame)
  }

  return {
    tick,
    start() {
      lastTime = 0
      rafId = requestAnimationFrame(frame)
    },
    stop() {
      cancelAnimationFrame(rafId)
    },
  }
}
