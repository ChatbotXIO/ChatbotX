import { z } from "zod"

export const chatbotIdRequestParams: [z.ZodBigInt] = [
  z.bigint().describe("chatbotId"),
]
export type ChatbotIdRequestParams = [bigint]

export const chatbotIdAndIdRequestParams: [z.ZodBigInt, z.ZodBigInt] = [
  z.bigint().describe("chatbotId"),
  z.bigint().describe("id"),
]
export type ChatbotIdAndIdRequestParams = [bigint, bigint]

export const bulkUpdateIdsRequest = z.object({
  ids: z.array(z.bigint()),
})
export type BulkUpdateIdsRequest = z.infer<typeof bulkUpdateIdsRequest>
