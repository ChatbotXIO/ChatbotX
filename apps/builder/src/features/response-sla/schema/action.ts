import {
  RESPONSE_SLA_MAX_TARGET_SECONDS,
  RESPONSE_SLA_MIN_TARGET_SECONDS,
} from "@chatbotx.io/business"
import { z } from "zod"

const targetSeconds = z
  .number()
  .int()
  .min(RESPONSE_SLA_MIN_TARGET_SECONDS)
  .max(RESPONSE_SLA_MAX_TARGET_SECONDS)

/** Full replacement of the workspace policy (there is one per workspace). */
export const updateResponseSlaRequest = z.object({
  enabled: z
    .boolean()
    .default(true)
    .describe(
      "false keeps the targets but stops tracking new SLA windows (turn off without losing the configuration). Default true.",
    ),
  firstResponseTargetSeconds: targetSeconds.describe(
    `Seconds allowed for the first human reply (${RESPONSE_SLA_MIN_TARGET_SECONDS}..${RESPONSE_SLA_MAX_TARGET_SECONDS}), counted in the assigned agent's working hours; unassigned conversations and agents without a schedule are counted in clock time.`,
  ),
  nextResponseTargetSeconds: targetSeconds
    .nullable()
    .describe(
      "Seconds allowed for later replies, same range; null = no SLA on later replies.",
    ),
  breachingThresholdPercent: z
    .number()
    .int()
    .min(1)
    .max(99)
    .default(25)
    .describe(
      "A window is `slaBreaching` once this percent of its target is left or less. Default 25.",
    ),
})
