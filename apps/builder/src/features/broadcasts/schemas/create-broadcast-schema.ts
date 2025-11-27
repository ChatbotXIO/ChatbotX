import {
  BroadcastInboxType,
  BroadcastSubaction,
  Operator,
} from "@aha.chat/database/enums"
import { BroadcastSchedulesType } from "@aha.chat/database/types"
import { z } from "zod"

export const createBroadcastRequest = z.object({
  inboxType: z.enum(BroadcastInboxType),
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
  contactFilter: z.object({
    operator: z.enum(["and", "or"]),
    conditions: z.array(
      z.object({
        field: z.string().trim(),
        operator: z.enum(Operator),
        value: z.union([z.string(), z.array(z.string())]),
      }),
    ),
  }),
})
export type CreateBroadcastRequest = z.infer<typeof createBroadcastRequest>
