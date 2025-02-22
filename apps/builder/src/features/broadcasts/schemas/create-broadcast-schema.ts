import { filterContactSchema } from "@/features/contacts/filter/schema"
import { BroadcastType } from "@ahachat.ai/database"
import { z } from "zod"

export const createBroadcastSchema = z.object({
  broadcastType: z.nativeEnum(BroadcastType),
  flowId: z.string().cuid2(),
  schedulesAt: z
    .string()
    .datetime()
    .refine(
      (value) => {
        console.log(new Date(value), new Date())
        return new Date(value) > new Date()
      },
      {
        message: "Datetime must be after now.",
      },
    )
    .nullable()
    .optional(),
  conditions: filterContactSchema,
})
export type CreateBroadcastSchema = z.infer<typeof createBroadcastSchema>

export const createBroadcastBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type CreateBroadcastBindSchema = [chatbotId: string]
