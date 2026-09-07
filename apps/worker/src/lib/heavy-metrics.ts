import { logger } from "./logger"

export type HeavyMetricEvent =
  | "completed"
  | "failed"
  | "received"
  | "stalled"
  | "started"

export type HeavyMetricOutcome =
  | "completed"
  | "expected_error"
  | "failed"
  | "retryable_failed"

/**
 * Emits bounded structured events until the deployment has a metrics exporter.
 * Never include workspace IDs, prompts, URLs, file paths, or provider secrets.
 */
export function recordHeavyMetric(input: {
  action?: string
  attempts?: number
  durationMs?: number
  event: HeavyMetricEvent
  outcome?: HeavyMetricOutcome
  providerLatencyMs?: number
  provider?: string
  queueWaitMs?: number
}) {
  logger.info(
    {
      metric: "heavy_worker",
      ...input,
    },
    "heavy_worker_metric",
  )
}
