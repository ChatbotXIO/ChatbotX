import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const createEmailTopicRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("Email topic name."),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to place the topic in, or null for root-level."),
})
export type CreateEmailTopicRequest = z.infer<typeof createEmailTopicRequest>

export const updateEmailTopicRequest = z.object({
  name: z.string().trim().min(1).max(255).describe("New email topic name."),
})
export type UpdateEmailTopicRequest = z.infer<typeof updateEmailTopicRequest>
