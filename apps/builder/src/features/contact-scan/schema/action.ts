import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/**
 * `inboxId` + a "scan messages from" timestamp that must be in the past
 * (plan §3.2 step 1 / `ContactScanService.schedule`). The service re-checks
 * the same rule server-side — this refine only gives the form instant
 * feedback before the round-trip.
 */
export const scheduleContactScanRequest = z
  .object({
    inboxId: zodBigintAsString(),
    scanFromAt: z.coerce.date(),
  })
  .refine((data) => data.scanFromAt.getTime() < Date.now(), {
    message: "Scan-from time must be in the past.",
    path: ["scanFromAt"],
  })
export type ScheduleContactScanRequest = z.infer<
  typeof scheduleContactScanRequest
>

export const scheduleContactScanResponse = z.object({
  runId: z.string(),
})
export type ScheduleContactScanResponse = z.infer<
  typeof scheduleContactScanResponse
>
