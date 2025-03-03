import { z } from "zod"

export const chatbotIdRequestParams = z.tuple([
  z.string().cuid2().describe("chatbotId"),
])
export type ChatbotIdRequestParams = z.infer<typeof chatbotIdRequestParams>

export const chatbotIdAndIdRequestParams = z.tuple([
  z.string().cuid2().describe("chatbotId"),
  z.string().cuid2().describe("id"),
])
export type ChatbotIdAndIdRequestParams = z.infer<
  typeof chatbotIdAndIdRequestParams
>

export const deleteRequestSchema = z.object({
  ids: z.array(z.string().cuid2()),
})
export type DeleteRequestSchema = z.infer<typeof deleteRequestSchema>
