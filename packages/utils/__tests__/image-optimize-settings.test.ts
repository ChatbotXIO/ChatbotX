import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ error: mocks.error }),
}))

const { isStoredImageOptimizationEnabled, runInEncodeSlot } = await import(
  "../src/image-optimize-settings"
)
const { isLiveMediaLazyChannel } = await import("../src/live-media")

describe("isStoredImageOptimizationEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("is on by default and off when switched off", () => {
    expect(isStoredImageOptimizationEnabled()).toBe(true)
    vi.stubEnv("STORED_IMAGE_OPTIMIZATION", "off")
    expect(isStoredImageOptimizationEnabled()).toBe(false)
  })

  it("treats a misconfigured value as off and says so, instead of throwing", () => {
    vi.stubEnv("STORED_IMAGE_OPTIMIZATION", "true")

    expect(isStoredImageOptimizationEnabled()).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      expect.any(String),
    )
  })

  it("never breaks unrelated settings read on the webhook path", () => {
    vi.stubEnv("STORED_IMAGE_OPTIMIZATION", "true")
    expect(isLiveMediaLazyChannel("messenger")).toBe(true)
  })
})

describe("runInEncodeSlot", () => {
  const deferred = () => {
    let resolve: () => void = () => undefined
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    return { promise, resolve }
  }

  it("never runs more than the limit at once, and a waiting caller runs once a slot frees", async () => {
    const first = deferred()
    let running = 0
    let peak = 0
    const work = (gate: Promise<void>) => async () => {
      running += 1
      peak = Math.max(peak, running)
      await gate
      running -= 1
      return "done"
    }

    const holder = runInEncodeSlot(
      { limit: 1, wait: false },
      work(first.promise),
    )
    const waiter = runInEncodeSlot(
      { limit: 1, wait: true },
      work(Promise.resolve()),
    )
    const refused = await runInEncodeSlot(
      { limit: 1, wait: false },
      work(Promise.resolve()),
    )
    first.resolve()

    expect(refused).toBeNull()
    await expect(holder).resolves.toEqual({ value: "done" })
    await expect(waiter).resolves.toEqual({ value: "done" })
    expect(peak).toBe(1)
  })

  it("bounds how many callers may wait, so a backlog cannot pile up in memory", async () => {
    // Each waiter holds the image it downloaded: past a few per slot the
    // caller is told to go on without encoding instead of queueing.
    const gate = deferred()
    const holder = runInEncodeSlot(
      { limit: 1, wait: false },
      () => gate.promise,
    )
    const waiters = Array.from({ length: 4 }, () =>
      runInEncodeSlot({ limit: 1, wait: true }, () => Promise.resolve("ok")),
    )

    await expect(
      runInEncodeSlot({ limit: 1, wait: true }, () => Promise.resolve("late")),
    ).resolves.toBeNull()

    gate.resolve()
    await holder
    for (const waiter of waiters) {
      await expect(waiter).resolves.toEqual({ value: "ok" })
    }
  })

  it("frees its slot when the work throws", async () => {
    await expect(
      runInEncodeSlot({ limit: 1, wait: false }, () =>
        Promise.reject(new Error("encode failed")),
      ),
    ).rejects.toThrow("encode failed")

    await expect(
      runInEncodeSlot({ limit: 1, wait: false }, () => Promise.resolve("ok")),
    ).resolves.toEqual({ value: "ok" })
  })
})
