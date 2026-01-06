import { z } from "zod"

export const connectMailchimpSchema = z.object({
  referer: z.url(),
})

export type ConnectMailchimpSchema = z.infer<typeof connectMailchimpSchema>

export const mailchimpQuerySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lists") }),
  z.object({
    action: z.literal("tags"),
    listId: z.string().min(1, "listId is required"),
  }),
  z.object({
    action: z.literal("merge-fields"),
    listId: z.string().min(1, "listId is required"),
  }),
])

export type MailchimpQuerySchema = z.infer<typeof mailchimpQuerySchema>
