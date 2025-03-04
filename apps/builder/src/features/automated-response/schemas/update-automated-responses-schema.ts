import { z } from "zod"
import { ReplyType } from "./create-automated-responses-schema"

export const updateAutomatedResponseRequest = z.object({
  folderId: z.string().cuid2().nullable().optional(),
  userMessages: z.array(z.string().min(1).max(255)).optional(),
  replies: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal(ReplyType.FLOW),
          flowId: z.string().cuid2(),
        }),
        z.object({
          type: z.literal(ReplyType.MESSAGE),
          message: z.string().min(1).max(255),
          buttons: z.array(
            z.object({
              label: z.string().min(1).max(255),
              url: z.string().url(),
            }),
          ),
        }),
      ]),
    )
    .optional(),
  status: z.boolean().optional(),
})
export type UpdateAutomatedResponseRequest = z.infer<
  typeof updateAutomatedResponseRequest
>
