import { ReplyType } from "@aha.chat/database/types"
import { z } from "zod"

export const updateAutomatedResponseRequest = z.object({
  folderId: z.cuid2().nullable().optional(),
  userMessages: z
    .array(
      z.object({
        value: z.string().min(1).max(255),
      }),
    )
    .min(1)
    .optional(),
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
    .optional()
    .superRefine((replies, ctx) => {
      // check flow is duplicated
      const flowIds = (replies ?? [])
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
      const messages = (replies ?? [])
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
  status: z.boolean().optional(),
})
export type UpdateAutomatedResponseRequest = z.infer<
  typeof updateAutomatedResponseRequest
>
