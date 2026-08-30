import type { CoexistUsageSignal } from "./pull-adapter"

const DEFAULT_EXHAUSTED_PAUSE_MS = 30_000

export type UsageThrottleDecision = {
  concurrency: number
  pauseMs: number
}

const boundedPauseMs = (seconds: number | undefined, maxPauseMs: number) => {
  const requestedMs =
    typeof seconds === "number" && seconds > 0
      ? seconds * 1000
      : DEFAULT_EXHAUSTED_PAUSE_MS
  return Math.min(requestedMs, maxPauseMs)
}

const usagePeak = (signal: CoexistUsageSignal): number =>
  Math.max(
    signal.callCount ?? 0,
    signal.totalCputime ?? 0,
    signal.totalTime ?? 0,
  )

export const resolveUsageThrottle = (props: {
  signal: CoexistUsageSignal | null | undefined
  defaultConcurrency: number
  maxPauseMs: number
}): UsageThrottleDecision => {
  const { signal, defaultConcurrency, maxPauseMs } = props
  if (!signal) {
    return { concurrency: defaultConcurrency, pauseMs: 0 }
  }

  if (
    signal.kind === "meta-business-use-case-usage" &&
    (signal.estimatedTimeToRegainAccess ?? 0) > 0
  ) {
    return {
      concurrency: 0,
      pauseMs: boundedPauseMs(signal.estimatedTimeToRegainAccess, maxPauseMs),
    }
  }

  const peak = usagePeak(signal)
  if (peak < 50) {
    return { concurrency: defaultConcurrency, pauseMs: 0 }
  }
  if (peak < 75) {
    return { concurrency: Math.min(defaultConcurrency, 3), pauseMs: 0 }
  }
  if (peak < 90) {
    return { concurrency: 1, pauseMs: 0 }
  }
  return {
    concurrency: 0,
    pauseMs: boundedPauseMs(undefined, maxPauseMs),
  }
}

export const sleepForUsageThrottle = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))
