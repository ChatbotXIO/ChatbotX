import { z } from "zod"

export const smartDelayTypes = z.enum(["waitNode", "followUp"])
export type SmartDelayType = z.infer<typeof smartDelayTypes>

export const smartDelayStatuses = z.enum([
  "pending",
  "scheduled",
  "completed",
  "failed",
  "canceled",
])
export type SmartDelayStatus = z.infer<typeof smartDelayStatuses>
