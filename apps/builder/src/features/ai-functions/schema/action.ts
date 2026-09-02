import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { aiFunctionResource } from "./resource"

export const listAIFunctionsRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListAIFunctionsRequest = z.infer<typeof listAIFunctionsRequest>

export const listAIFunctionsResponse = z.object({
  data: z.array(aiFunctionResource),
})
export type ListAIFunctionsResponse = z.infer<typeof listAIFunctionsResponse>

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
  triggerFlowId: zodBigintAsString().nullish(),
})
export type CreateAIFunctionRequest = z.infer<typeof createAIFunctionRequest>

export const updateAIFunctionRequest = createAIFunctionRequest
export type UpdateAIFunctionRequest = z.infer<typeof updateAIFunctionRequest>
