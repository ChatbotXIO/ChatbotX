import { z } from "zod"

export const ReplyType = {
  MESSAGE: "MESSAGE",
  FLOW: "FLOW",
} as const

export const createAutomatedResponseRequest = z.object({
  folderId: z.string().cuid2().nullish(),
  userMessages: z.array(z.string().min(1).max(255)),
  replies: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal(ReplyType.FLOW),
          flowId: z.string(),
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
    .min(1),
})
export type CreateAutomatedResponseRequest = z.infer<
  typeof createAutomatedResponseRequest
>
