import { z } from "zod"

export const smartDelayTypes = z.enum(["waitNode"])
export type SmartDelayType = z.infer<typeof smartDelayTypes>

export const smartDelayStatuses = z.enum(["pending", "completed", "failed"])
export type SmartDelayStatus = z.infer<typeof smartDelayStatuses>
