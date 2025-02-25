import { z } from "zod"
import { ReplyType } from "./create-automated-responses-schema"

export const updateAutomatedResponseSchema = z.object({
  keyword: z.string().max(255).min(1),
  replies: z.array(
    z.object({
      type: z.enum([ReplyType.Message, ReplyType.Flow]),
      flowId: z.string().cuid2().optional(),
      answer: z.string().max(255).optional(),
      buttons: z
        .array(
          z.object({
            label: z.string().max(255),
            url: z.string().url(),
          }),
        )
        .optional(),
    }),
  ),
})
export type UpdateAutomatedResponseSchema = z.infer<
  typeof updateAutomatedResponseSchema
>

export const updateAutomatedResponseBindSchema: [id: z.ZodString] = [
  z.string().cuid2(),
]
export type UpdateAutomatedResponseBindSchema = [id: string]

export const updateStatusAutomatedResponseSchema = z.object({
  status: z.boolean(),
})
export type UpdateStatusAutomatedResponseSchema = z.infer<
  typeof updateStatusAutomatedResponseSchema
>
