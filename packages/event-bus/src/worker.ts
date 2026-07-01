import type { EventModule } from "./event-bus"

// biome-ignore lint/suspicious/noExplicitAny: Required for generic module storage
const activeModules: EventModule<any, any>[] = []
let consumingPromises: Promise<unknown>[] = []

// Cap how long shutdown waits for in-flight consume loops to exit before
// deregistering, so a batch stuck in processing can't hang shutdown forever.
const SHUTDOWN_DRAIN_TIMEOUT_MS = 6000

export async function startWorker(
  // biome-ignore lint/suspicious/noExplicitAny: Required for generic module types
  modules: EventModule<any, any>[],
  consumerName?: string,
): Promise<void> {
  if (activeModules.length > 0) {
    await stopWorker()
  }

  const name =
    consumerName ??
    `worker-${process.env.HOSTNAME || "chatbotx"}-${process.pid}`

  for (const mod of modules) {
    activeModules.push(mod)
    await mod.bus.initialize()
    if (mod.init) {
      await mod.init()
    }
    consumingPromises.push(
      Promise.resolve(mod.bus.startConsuming(name, mod.listeners)),
    )
  }
}

export async function stopWorker(): Promise<void> {
  for (const mod of activeModules) {
    mod.bus.stop()
  }

  // Let the consume loops exit on their own (bounded) so the blocking Redis
  // connection is never closed mid-command; only then deregister each consumer.
  await drainConsumeLoops(consumingPromises, SHUTDOWN_DRAIN_TIMEOUT_MS)
  await Promise.allSettled(activeModules.map((mod) => mod.bus.deregister()))
  activeModules.length = 0
  consumingPromises = []
}

async function drainConsumeLoops(
  promises: Promise<unknown>[],
  timeoutMs: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs)
  })

  try {
    await Promise.race([Promise.allSettled(promises), timeout])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}
