import { flushAllPendingWorkspaceRealtimeEvents } from "@chatbotx.io/business"
import { normalizeError } from "universal-error-normalizer"
import { env } from "../env"
import { logger } from "./logger"

type Closer = () => Promise<unknown> | unknown
type NamedCloser = [name: string, close: Closer]

// One process-wide coordinator for every worker entry in the process. Each
// entry used to install its own SIGINT/SIGTERM handler that called
// `process.exit` as soon as *its* worker closed, which is fine one-per-process
// but cuts off the others when several entries share a process
// (`src/core.ts`, `src/standalone.ts`).
const closers = new Map<string, Closer>()
const finalizers = new Map<string, Closer>()
let isInstalled = false
let isShuttingDown = false

onShutdownFinalize(
  "workspace-realtime-events",
  flushAllPendingWorkspaceRealtimeEvents,
)

async function closeAll(
  entries: NamedCloser[],
  pending?: Set<string>,
): Promise<boolean> {
  const results = await Promise.allSettled(
    entries.map(async ([name, close]) => {
      try {
        await close()
      } finally {
        pending?.delete(name)
      }
    }),
  )
  let hasFailure = false
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      hasFailure = true
      logger.error(
        { err: normalizeError(result.reason), worker: entries[index][0] },
        "Error during worker shutdown",
      )
    }
  }
  return hasFailure
}

/**
 * Drains every registered worker, then exits with `exitCode` (1 if any close
 * failed). `worker.close()` waits for active jobs. An optional deadline bounds
 * the drain: past it the process exits 1 and logs which workers were still
 * busy — their jobs go stalled and BullMQ retries them, the same outcome as the
 * orchestrator's SIGKILL but with a log line. Keep
 * WORKER_SHUTDOWN_TIMEOUT_MS below the stop grace period.
 */
export async function requestShutdown(
  reason: string,
  exitCode = 0,
): Promise<void> {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true

  const workerClosers = [...closers]
  const shutdownFinalizers = [...finalizers]
  const pending = new Set(workerClosers.map(([name]) => name))
  const timeoutMs = env.WORKER_SHUTDOWN_TIMEOUT_MS
  logger.info({ reason, workers: [...pending] }, "Shutting down")

  let deadline: ReturnType<typeof setTimeout> | undefined
  if (timeoutMs !== undefined) {
    deadline = setTimeout(() => {
      logger.error(
        { reason, pending: [...pending], timeoutMs },
        "Shutdown timed out with workers still draining",
      )
      process.exit(1)
    }, timeoutMs)
    // Never the reason the process stays alive; the drain itself decides that.
    deadline.unref()
  }

  const workerCloseFailed = await closeAll(workerClosers, pending)
  const finalizerFailed = await closeAll(shutdownFinalizers)
  clearTimeout(deadline)
  process.exit(workerCloseFailed || finalizerFailed ? 1 : exitCode)
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
  if (isShuttingDown) {
    logger.warn(
      { worker: name },
      "Ignoring worker shutdown closer registered after shutdown began",
    )
    return
  }

  closers.set(name, close)
  if (isInstalled) {
    return
  }
  isInstalled = true
  installProcessHandlers()
}

export function onShutdownFinalize(name: string, close: Closer): void {
  if (finalizers.has(name)) {
    return
  }
  finalizers.set(name, close)
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
