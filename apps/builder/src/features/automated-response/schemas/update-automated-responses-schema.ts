import { ReplyType } from "@aha.chat/database/types"
import { z } from "zod"

export const updateAutomatedResponseRequest = z.object({
  folderId: z.cuid2().nullable().optional(),
  userMessages: z.array(z.string().min(1).max(255)).optional(),
  replies: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal(ReplyType.Flow),
          flowId: z.cuid2(),
        }),
        z.object({
          type: z.literal(ReplyType.Message),
          message: z.string().min(1).max(255),
          buttons: z.array(
            z.object({
              label: z.string().min(1).max(255),
              url: z.url(),
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
