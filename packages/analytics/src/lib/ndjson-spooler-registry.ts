import { NdjsonSpooler } from "@aha.chat/filesystem/server"
import { buildTmpFilename, getDefaultSpoolerConfig } from "./events-config"

type NdjsonSpoolerInitConfig = {
  eventType: string
  rootPath: string
  acceptWindowSeconds: number
  instanceId?: string
}

type RegistryEntry = {
  instance: NdjsonSpooler | null
  initPromise: Promise<NdjsonSpooler> | null
}

const registry = new Map<string, RegistryEntry>()

function getEntry(type: string): RegistryEntry {
  const existing = registry.get(type)
  if (existing) {
    return existing
  }

  const created: RegistryEntry = { instance: null, initPromise: null }
  registry.set(type, created)
  return created
}

async function initSpooler(
  cfg: NdjsonSpoolerInitConfig,
): Promise<NdjsonSpooler> {
  const entry = getEntry(cfg.eventType)

  if (entry.instance) {
    return entry.instance
  }

  if (entry.initPromise) {
    return entry.initPromise
  }

  entry.initPromise = (async () => {
    const spooler = new NdjsonSpooler({
      eventType: cfg.eventType,
      rootPath: cfg.rootPath,
      acceptWindowSeconds: cfg.acceptWindowSeconds,
      instanceId: cfg.instanceId,
      buildFilename: buildTmpFilename,
    })

    await spooler.initialize()

    entry.instance = spooler
    return spooler
  })()

  try {
    return await entry.initPromise
  } finally {
    entry.initPromise = null
  }
}

export function getSpooler(eventType: string): NdjsonSpooler | null {
  return registry.get(eventType)?.instance ?? null
}

async function stopSpooler(eventType: string): Promise<void> {
  const entry = registry.get(eventType)
  if (!entry?.instance) {
    return
  }

  await entry.instance.shutdown()
  entry.instance = null
}

export function createSpoolerHelpers(eventType: string) {
  return {
    init: (config?: Partial<Omit<NdjsonSpoolerInitConfig, "eventType">>) => {
      const defaultConfig = getDefaultSpoolerConfig()
      const finalConfig = {
        ...defaultConfig,
        ...config,
      }
      return initSpooler({ ...finalConfig, eventType })
    },
    get: () => {
      return getSpooler(eventType)
    },
    stop: () => {
      return stopSpooler(eventType)
    },
  }
}
