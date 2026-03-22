import type { AIFunctionModel } from "@aha.chat/database/types"
import { z } from "zod"

export type AIFunctionCollection = {
  data: AIFunctionModel[]
}

export const listAIFunctionsRequest = z.object({
  chatbotId: z.string(),
})
export type GetAIFunctionsRequest = z.infer<typeof listAIFunctionsRequest>

export const createAIFunctionRequest = z.object({
  name: z.string().trim().min(1),
  purpose: z.string().trim().nullish(),
  dataCollect: z.array(
    z.object({
      from: z.string().trim().min(1),
      to: z.string().trim().min(1),
    }),
  ),
  outputMessage: z.string().trim().nullish(),
  triggerFlowId: z
    .string()
    .trim()
    .nullish()
    .transform((val) => val || null),
})
export type CreateAIFunctionRequest = z.infer<typeof createAIFunctionRequest>

export const updateAIFunctionRequest = createAIFunctionRequest.partial()
export type UpdateAIFunctionRequest = z.infer<typeof updateAIFunctionRequest>
