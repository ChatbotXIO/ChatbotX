import type { BaseEventListener } from "@chatbotx.io/flow-config"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { EventModule } from "../src/event-bus"
import { startWorker, stopWorker } from "../src/worker"

type TestEventMap = {
  "test:event": { value: string }
}

const TIMESTAMPED_WORKER_NAME = /^worker-worker-host-\d+-\d+$/

function createModule(): EventModule<
  TestEventMap,
  BaseEventListener<TestEventMap[keyof TestEventMap]>
> {
  return {
    bus: {
      deregister: vi.fn().mockResolvedValue(undefined),
      initialize: vi.fn().mockResolvedValue(undefined),
      startConsuming: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
    } as unknown as EventModule<TestEventMap>["bus"],
    listeners: {},
  }
}

describe("event worker lifecycle", () => {
  afterEach(async () => {
    await stopWorker()
    vi.restoreAllMocks()
  })

  test("uses a stable default consumer name without a timestamp segment", async () => {
    const originalHostname = process.env.HOSTNAME
    try {
      process.env.HOSTNAME = "worker-host"
      const mod = createModule()

      await startWorker([mod])

      expect(mod.bus.startConsuming).toHaveBeenCalledWith(
        `worker-worker-host-${process.pid}`,
        {},
      )
      expect(mod.bus.startConsuming).not.toHaveBeenCalledWith(
        expect.stringMatching(TIMESTAMPED_WORKER_NAME),
        {},
      )
    } finally {
      if (originalHostname === undefined) {
        delete process.env.HOSTNAME
      } else {
        process.env.HOSTNAME = originalHostname
      }
    }
  })

  test("stops consumers before deregistering them on shutdown", async () => {
    const mod = createModule()
    await startWorker([mod], "consumer-1")

    const stopped = stopWorker()

    expect(mod.bus.stop).toHaveBeenCalledTimes(1)
    expect(mod.bus.deregister).not.toHaveBeenCalled()

    await stopped

    expect(mod.bus.deregister).toHaveBeenCalledTimes(1)
  })

  test("waits for consume loops to drain before deregistering", async () => {
    const mod = createModule()
    let resolveLoop: () => void = () => undefined
    const loop = new Promise<void>((resolve) => {
      resolveLoop = resolve
    })
    const startConsuming = mod.bus.startConsuming as ReturnType<typeof vi.fn>
    const stop = mod.bus.stop as ReturnType<typeof vi.fn>
    startConsuming.mockReturnValue(loop)
    stop.mockImplementation(() => {
      resolveLoop()
    })

    await startWorker([mod], "consumer-1")
    await stopWorker()

    expect(stop).toHaveBeenCalledTimes(1)
    expect(mod.bus.deregister).toHaveBeenCalledTimes(1)
  })
})
