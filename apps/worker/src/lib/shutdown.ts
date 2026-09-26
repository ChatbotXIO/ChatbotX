import { normalizeError } from "universal-error-normalizer"
import { env } from "../env"
import { logger } from "./logger"

type Closer = () => Promise<unknown> | unknown

// One process-wide coordinator for every worker entry in the process. Each
// entry used to install its own SIGINT/SIGTERM handler that called
// `process.exit` as soon as *its* worker closed, which is fine one-per-process
// but cuts off the others when several entries share a process
// (`src/core.ts`, `src/standalone.ts`).
const closers = new Map<string, Closer>()
let isInstalled = false
let isShuttingDown = false

async function closeAll(pending: Set<string>): Promise<boolean> {
  const results = await Promise.allSettled(
    [...closers].map(async ([name, close]) => {
      try {
        await close()
      } finally {
        pending.delete(name)
      }
    }),
  )
  const names = [...closers.keys()]
  let hasFailure = false
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      hasFailure = true
      logger.error(
        { err: normalizeError(result.reason), worker: names[index] },
        "Error during worker shutdown",
      )
    }
  })
  return hasFailure
}

/**
 * Drains every registered worker, then exits with `exitCode` (1 if any close
 * failed). `worker.close()` waits for active jobs, and co-located queues now
 * wait on the slowest one, so a deadline bounds the drain: past it the process
 * exits 1 and logs which workers were still busy — their jobs go stalled and
 * BullMQ retries them, the same outcome as the orchestrator's SIGKILL but with
 * a log line. Keep WORKER_SHUTDOWN_TIMEOUT_MS below the stop grace period.
 */
export async function requestShutdown(
  reason: string,
  exitCode = 0,
): Promise<void> {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  const pending = new Set(closers.keys())
  const timeoutMs = env.WORKER_SHUTDOWN_TIMEOUT_MS
  logger.info({ reason, workers: [...pending] }, "Shutting down")

  const deadline = setTimeout(() => {
    logger.error(
      { reason, pending: [...pending], timeoutMs },
      "Shutdown timed out with workers still draining",
    )
    process.exit(1)
  }, timeoutMs)
  // Never the reason the process stays alive; the drain itself decides that.
  deadline.unref()

  const hasFailure = await closeAll(pending)
  clearTimeout(deadline)
  process.exit(hasFailure ? 1 : exitCode)
}

function installProcessHandlers(): void {
  process.once("SIGINT", () => requestShutdown("SIGINT"))
  process.once("SIGTERM", () => requestShutdown("SIGTERM"))
  // Node would crash on these anyway; drain the co-located workers first.
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: normalizeError(error) }, "Uncaught exception")
    requestShutdown("uncaughtException", 1)
  })
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: normalizeError(reason) }, "Unhandled rejection")
    requestShutdown("unhandledRejection", 1)
  })
}

export function onShutdown(name: string, close: Closer): void {
  closers.set(name, close)
  if (isInstalled) {
    return
  }
  isInstalled = true
  installProcessHandlers()
}

/**
 * Starts a worker entry. A startup failure drains the workers already running
 * in this process and exits 1 so the container restarts, instead of leaving a
 * dangling rejection (or a half-started process that looks healthy).
 */
export function runWorker(name: string, start: () => Promise<unknown>): void {
  start().catch((error: unknown) => {
    logger.error(
      { err: normalizeError(error), worker: name },
      "Failed to start worker",
    )
    requestShutdown(`${name} failed to start`, 1)
  })
}
