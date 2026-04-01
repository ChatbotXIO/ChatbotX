import { z } from "zod"

export const sequenceEventTypes = z.enum([
  "dispatch_canceled",
  "dispatch_rescheduled",
  "dispatch_paused",
  "dispatch_resumed",
])
export type SequenceEventType = z.infer<typeof sequenceEventTypes>
