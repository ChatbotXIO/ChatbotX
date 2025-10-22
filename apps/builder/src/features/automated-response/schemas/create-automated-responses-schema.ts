import { ReplyType } from "@aha.chat/database/types"
import { z } from "zod"

export const createAutomatedResponseRequest = z.object({
  folderId: z.cuid2().nullish(),
  userMessages: z.array(z.string().min(1).max(255)),
  replies: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal(ReplyType.Flow),
          flowId: z.string(),
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
    .min(1),
})
export type CreateAutomatedResponseRequest = z.infer<
  typeof createAutomatedResponseRequest
>
