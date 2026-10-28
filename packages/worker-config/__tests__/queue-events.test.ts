import { beforeEach, describe, expect, test, vi } from "vitest"

const { closeSpy, queueEventsCtor } = vi.hoisted(() => ({
  closeSpy: vi.fn(async () => undefined),
  queueEventsCtor: vi.fn(),
}))

vi.mock("bullmq", () => ({
  QueueEvents: class {
    close = closeSpy
    constructor(name: string) {
      queueEventsCtor(name)
    }
  },
}))

vi.mock("../src/lib/connection", () => ({
  getQueueConnection: () => ({ duplicate: () => ({}) }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe("shared queue events", () => {
  test("returns the same instance for the same queue", async () => {
    const { getQueueEvents } = await import("../src/lib/job-wait")

    expect(getQueueEvents("chat")).toBe(getQueueEvents("chat"))
    expect(getQueueEvents("heavy")).not.toBe(getQueueEvents("chat"))
    expect(queueEventsCtor).toHaveBeenCalledTimes(2)
  })

  test("closes every instance and creates a fresh one afterwards", async () => {
    const { closeAllQueueEvents, getQueueEvents } = await import(
      "../src/lib/job-wait"
    )
    const chat = getQueueEvents("chat")
    getQueueEvents("heavy")

    await closeAllQueueEvents()

    expect(closeSpy).toHaveBeenCalledTimes(2)
    expect(getQueueEvents("chat")).not.toBe(chat)
  })
})
