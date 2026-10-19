import { afterEach, describe, expect, test, vi } from "vitest"

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock("../src/logger", () => ({ logger }))

import { createShutdownHandler } from "../src/shutdown"

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("realtime gateway shutdown", () => {
  test("closes the gateway once when SIGTERM arrives", async () => {
    vi.useFakeTimers()
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const close = vi.fn().mockResolvedValue(undefined)
    const shutdown = createShutdownHandler({ close })

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGTERM")])

    expect(close).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      { signal: "SIGTERM" },
      "Stopping realtime gateway",
    )
    await vi.advanceTimersByTimeAsync(10_000)
    expect(processExit).toHaveBeenCalledWith(0)
  })

  test("logs a close failure, sets a failing exit code, and forces process exit", async () => {
    vi.useFakeTimers()
    const originalExitCode = process.exitCode
    const processExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never)
    const error = new Error("close failed")
    const shutdown = createShutdownHandler({
      close: vi.fn().mockRejectedValue(error),
    })

    try {
      await expect(shutdown("SIGINT")).resolves.toBeUndefined()

      expect(process.exitCode).toBe(1)
      expect(logger.error).toHaveBeenCalledWith(
        { err: error, signal: "SIGINT" },
        "Error while stopping realtime gateway",
      )

      await vi.advanceTimersByTimeAsync(10_000)

      expect(processExit).toHaveBeenCalledWith(1)
    } finally {
      process.exitCode = originalExitCode
    }
  })
})
