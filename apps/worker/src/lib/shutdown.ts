import { normalizeError } from "universal-error-normalizer"
import { logger } from "./logger"

type Closer = () => Promise<unknown> | unknown

// One process-wide SIGINT/SIGTERM handler that closes every registered worker
// before exiting. Each worker entry used to install its own handler that called
// `process.exit` as soon as *its* worker closed, which is fine one-per-process
// but would cut off the others when several entries share a process
// (`src/core.ts`, used by `pnpm dev` and `worker core`).
const closers = new Map<string, Closer>()
let isInstalled = false
let isShuttingDown = false

export async function requestShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true
  logger.info({ signal, workers: [...closers.keys()] }, "Shutting down")

  const results = await Promise.allSettled(
    [...closers.values()].map((close) => close()),
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
  process.exit(hasFailure ? 1 : 0)
}

export function onShutdown(name: string, close: Closer): void {
  closers.set(name, close)
  if (isInstalled) {
    return
  }
  isInstalled = true
  process.once("SIGINT", () => requestShutdown("SIGINT"))
  process.once("SIGTERM", () => requestShutdown("SIGTERM"))
}
