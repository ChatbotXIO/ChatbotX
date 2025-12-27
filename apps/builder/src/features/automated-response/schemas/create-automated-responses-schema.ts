import { ReplyType } from "@aha.chat/database/types"
import { z } from "zod"

export const createAutomatedResponseRequest = z.object({
  folderId: z.cuid2().nullish(),
  userMessages: z
    .array(
      z.object({
        value: z.string().min(1).max(255),
      }),
    )
    .min(1),
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
    .min(1)
    .superRefine((replies, ctx) => {
      // check flow is duplicated
      const flowIds = replies
        .filter((r) => r.type === ReplyType.Flow)
        .map((r) => r.flowId)
      const flowDuplicates = flowIds.filter(
        (id, idx) => flowIds.indexOf(id) !== idx,
      )
      if (flowDuplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Replies is duplicated!",
          path: ["replies"],
        })
      }

      // check message is duplicated
      const messages = replies
        .filter((r) => r.type === ReplyType.Message)
        .map((r) => r.message)
      const messageDuplicates = messages.filter(
        (msg, idx) => messages.indexOf(msg) !== idx,
      )
      if (messageDuplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Message is duplicated!",
          path: ["messages"],
        })
      }
    }),
})
export type CreateAutomatedResponseRequest = z.infer<
  typeof createAutomatedResponseRequest
>
