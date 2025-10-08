import { z } from "zod"

export const chatbotIdRequestParams: [z.ZodCUID2] = [
  z.cuid2().describe("chatbotId"),
]
export type ChatbotIdRequestParams = [string]

export const chatbotIdAndIdRequestParams: [z.ZodCUID2, z.ZodCUID2] = [
  z.cuid2().describe("chatbotId"),
  z.cuid2().describe("id"),
]
export type ChatbotIdAndIdRequestParams = [string, string]

export const bulkUpdateIdsRequest = z.object({
  ids: z.array(z.cuid2()),
})
export type BulkUpdateIdsRequest = z.infer<typeof bulkUpdateIdsRequest>
