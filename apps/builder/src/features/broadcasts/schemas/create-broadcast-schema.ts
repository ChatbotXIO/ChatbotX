import {
  BroadcastSchedulesType,
  BroadcastSubaction,
  InboxType,
} from "@aha.chat/database/types"
import { z } from "zod"

export const createBroadcastRequest = z.object({
  inboxType: z.enum(InboxType).nullable(),
  flowId: z.cuid2(),
  subaction: z.enum(BroadcastSubaction),
  schedulesType: z.enum(BroadcastSchedulesType),
  schedulesAt: z
    .string()
    .refine(
      (value) => {
        const date = new Date(value)
        const currentDate = new Date()

        return !Number.isNaN(date.getTime()) && date > currentDate
      },
      {
        message: "Schedules must be after now.",
      },
    )
    .nullable(),
  conditions: z.any().nullable(),
})
export type CreateBroadcastRequest = z.infer<typeof createBroadcastRequest>
