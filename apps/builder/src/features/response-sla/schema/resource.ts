import { z } from "zod"

export const responseSlaResource = z.object({
  enabled: z
    .boolean()
    .describe(
      "false = configured but not tracking (no SLA windows, pills or met %).",
    ),
  firstResponseTargetSeconds: z
    .number()
    .int()
    .describe(
      "Seconds a human may leave a conversation's FIRST customer message unanswered (working time of the assigned agent).",
    ),
  nextResponseTargetSeconds: z
    .number()
    .int()
    .nullable()
    .describe(
      "Seconds for every LATER customer message; null = no SLA on later replies.",
    ),
  breachingThresholdPercent: z
    .number()
    .int()
    .describe(
      "A window counts as breaching once this percent of its target is left or less (1-99).",
    ),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type ResponseSlaResource = z.infer<typeof responseSlaResource>
