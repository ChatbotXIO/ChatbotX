import { describe, expect, test, vi } from "vitest"

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock("../src/logger", () => ({ logger }))

import { createShutdownHandler } from "../src/shutdown"

describe("realtime gateway shutdown", () => {
  test("closes the gateway once when SIGTERM arrives", async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const shutdown = createShutdownHandler({ close })

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGTERM")])

    expect(close).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      { signal: "SIGTERM" },
      "Stopping realtime gateway",
    )
  })

  test("logs a close failure without rejecting the signal handler", async () => {
    const error = new Error("close failed")
    const shutdown = createShutdownHandler({
      close: vi.fn().mockRejectedValue(error),
    })

    await expect(shutdown("SIGINT")).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalledWith(
      { err: error, signal: "SIGINT" },
      "Error while stopping realtime gateway",
    )
  })
})
