import {
  BroadcastSchedulesType,
  BroadcastSubaction,
  InboxType,
} from "@ahachat.ai/database/browser"
import { z } from "zod"

export const createBroadcastRequest = z.object({
  inboxType: z.nativeEnum(InboxType).nullable(),
  flowId: z.string().cuid2(),
  subaction: z.nativeEnum(BroadcastSubaction),
  schedulesType: z.nativeEnum(BroadcastSchedulesType),
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
