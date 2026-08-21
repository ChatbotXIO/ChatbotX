import type { Server } from "node:http"

type ExecutorLogger = {
  error: (bindings: Record<string, unknown>, message: string) => void
  info: (bindings: Record<string, unknown>, message: string) => void
}

type ExecutorRuntimeProcess = {
  exitCode?: number
  once: (signal: "SIGINT" | "SIGTERM", listener: () => void) => unknown
}

type StartJavascriptExecutorOptions = {
  host: string
  logger: ExecutorLogger
  port: number
  runtimeProcess?: ExecutorRuntimeProcess
  server: Server
}

const shutdownSignals = ["SIGINT", "SIGTERM"] as const

export const startJavascriptExecutor = async (
  options: StartJavascriptExecutorOptions,
): Promise<{
  shutdown: (signal: "SIGINT" | "SIGTERM") => Promise<void>
}> => {
  const runtimeProcess = options.runtimeProcess ?? process
  await new Promise<void>((resolve, reject) => {
    const handleListenError = (error: Error): void => reject(error)
    options.server.once("error", handleListenError)
    options.server.listen(options.port, options.host, () => {
      options.server.off("error", handleListenError)
      resolve()
    })
  })

  options.logger.info(
    { host: options.host, port: options.port },
    "JavaScript executor started",
  )

  let isShuttingDown = false
  const shutdown = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    if (isShuttingDown) {
      return
    }
    isShuttingDown = true
    options.logger.info({ signal }, "JavaScript executor shutting down")

    await new Promise<void>((resolve, reject) => {
      options.server.close((error) =>
        error === undefined ? resolve() : reject(error),
      )
    })
  }

  for (const signal of shutdownSignals) {
    runtimeProcess.once(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        options.logger.error(
          { err: error },
          "JavaScript executor shutdown failed",
        )
        runtimeProcess.exitCode = 1
      })
    })
  }

  return { shutdown }
}
