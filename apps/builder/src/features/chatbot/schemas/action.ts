import z from "zod"

export const updateChatbotTokenRequest = z.object({
  token: z.string(),
})
export type UpdateChatbotTokenRequest = z.infer<
  typeof updateChatbotTokenRequest
>
