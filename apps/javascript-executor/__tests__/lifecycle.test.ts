import type { Server } from "node:http"
import { describe, expect, test, vi } from "vitest"
import { startJavascriptExecutor } from "../src/lifecycle"

const createRuntimeProcess = () => {
  const listeners = new Map<string, () => void>()
  const runtimeProcess = {
    exitCode: undefined as number | undefined,
    once: vi.fn((signal: string, listener: () => void) => {
      listeners.set(signal, listener)
      return runtimeProcess
    }),
  }
  return { listeners, runtimeProcess }
}

const createLogger = () => ({
  error: vi.fn(),
  info: vi.fn(),
})

const createServer = (closeError?: Error) => {
  const errorListeners: Array<(error: Error) => void> = []
  return {
    close: vi.fn((callback: (error?: Error) => void) => callback(closeError)),
    listen: vi.fn((_port: number, _host: string, callback: () => void) =>
      callback(),
    ),
    off: vi.fn(),
    once: vi.fn((event: string, listener: (error: Error) => void) => {
      if (event === "error") {
        errorListeners.push(listener)
      }
    }),
    errorListeners,
  }
}

describe("JavaScript executor lifecycle", () => {
  test("starts once and shuts down idempotently", async () => {
    const server = createServer()
    const logger = createLogger()
    const { listeners, runtimeProcess } = createRuntimeProcess()

    const { shutdown } = await startJavascriptExecutor({
      server: server as unknown as Server,
      host: "127.0.0.1",
      port: 3210,
      logger,
      runtimeProcess,
    })

    expect(server.listen).toHaveBeenCalledWith(
      3210,
      "127.0.0.1",
      expect.any(Function),
    )
    expect(server.off).toHaveBeenCalledWith("error", server.errorListeners[0])
    expect(logger.info).toHaveBeenCalledWith(
      { host: "127.0.0.1", port: 3210 },
      "JavaScript executor started",
    )
    expect(listeners.has("SIGINT")).toBe(true)
    expect(listeners.has("SIGTERM")).toBe(true)

    await shutdown("SIGTERM")
    await shutdown("SIGINT")

    expect(server.close).toHaveBeenCalledOnce()
  })

  test("reports a shutdown failure from a signal handler", async () => {
    const closeError = new Error("close failed")
    const server = createServer(closeError)
    const logger = createLogger()
    const { listeners, runtimeProcess } = createRuntimeProcess()

    await startJavascriptExecutor({
      server: server as unknown as Server,
      host: "127.0.0.1",
      port: 3210,
      logger,
      runtimeProcess,
    })

    listeners.get("SIGTERM")?.()

    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        { err: closeError },
        "JavaScript executor shutdown failed",
      )
    })
    expect(runtimeProcess.exitCode).toBe(1)
  })

  test("rejects when the HTTP server fails to listen", async () => {
    const listenError = new Error("listen failed")
    const server = createServer()
    server.listen.mockImplementation(() => {
      server.errorListeners[0]?.(listenError)
      return server
    })
    const logger = createLogger()
    const { runtimeProcess } = createRuntimeProcess()

    await expect(
      startJavascriptExecutor({
        server: server as unknown as Server,
        host: "127.0.0.1",
        port: 3210,
        logger,
        runtimeProcess,
      }),
    ).rejects.toBe(listenError)
  })
})
