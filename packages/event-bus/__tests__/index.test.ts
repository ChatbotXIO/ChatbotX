import { afterEach, describe, expect, test, vi } from "vitest"

const workerConfigMock = vi.hoisted(() => {
  const redis = {}
  return {
    getRedisConnection: vi.fn(() => redis),
  }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: workerConfigMock.getRedisConnection,
}))

import { dashboardEventBus, emit, flowEventBus, messageEventBus } from "../src"
import { logger } from "../src/logger"

describe("emit", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("routes known event types to their owning bus", async () => {
    const messageEmit = vi
      .spyOn(messageEventBus, "emit")
      .mockResolvedValue("message-id")
    const flowEmit = vi.spyOn(flowEventBus, "emit").mockResolvedValue("flow-id")
    const dashboardEmit = vi
      .spyOn(dashboardEventBus, "emit")
      .mockResolvedValue("dashboard-id")

    await expect(emit("message:sent" as never, {} as never)).resolves.toBe(
      "message-id",
    )
    await expect(emit("flow:clicked" as never, {} as never)).resolves.toBe(
      "flow-id",
    )
    await expect(
      emit("analytics:dashboard" as never, {} as never),
    ).resolves.toBe("dashboard-id")
    await expect(emit("unknown:event" as never, {} as never)).resolves.toBe("")

    expect(messageEmit).toHaveBeenCalledTimes(1)
    expect(flowEmit).toHaveBeenCalledTimes(1)
    expect(dashboardEmit).toHaveBeenCalledTimes(1)
  })

  test("logs synchronous emit routing failures", () => {
    vi.spyOn(messageEventBus, "emit").mockImplementation(() => {
      throw new Error("emit failed")
    })
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(vi.fn())

    expect(emit("message:sent" as never, {} as never)).toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error), payload: {} },
      "Failed to emit event: message:sent",
    )
  })
})
