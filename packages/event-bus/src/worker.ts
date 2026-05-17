import type { EventModule } from "./event-bus"

// biome-ignore lint/suspicious/noExplicitAny: Required for generic module storage
const activeModules: EventModule<any, any>[] = []

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
    `worker-${process.env.HOSTNAME || "chatbotx"}-${process.pid}-${Date.now()}`

  for (const mod of modules) {
    activeModules.push(mod)
    await mod.bus.initialize()
    if (mod.init) {
      await mod.init()
    }
    mod.bus.startConsuming(name, mod.listeners)
  }
}

export async function stopWorker(): Promise<void> {
  for (const mod of activeModules) {
    mod.bus.stop()
  }

  await new Promise((resolve) => setTimeout(resolve, 2000))
  activeModules.length = 0
}
