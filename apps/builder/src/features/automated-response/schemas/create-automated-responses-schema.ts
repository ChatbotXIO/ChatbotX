import { z } from "zod"

export type AutomatedResponseReply = {
  type: ReplyType
  flowId?: string
  answer?: string
  buttons?: Array<{
    label: string
    url: string
  }>
}

export enum ReplyType {
  Message = "message",
  Flow = "flow",
}

export const createAutomatedResponseSchema = z.object({
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
export type CreateAutomatedResponseSchema = z.infer<
  typeof createAutomatedResponseSchema
>

export const createAutomatedResponseBindSchema: [
  chatbotId: z.ZodString,
  flowId: z.ZodNullable<z.ZodString>,
  folderId: z.ZodNullable<z.ZodString>,
] = [
  z.string().cuid2(),
  z.string().cuid2().nullable(),
  z.string().cuid2().nullable(),
]
export type CreateAutomatedResponseBindSchema = [
  chatbotId: string,
  flowId: string | null,
  folderId: string | null,
]
