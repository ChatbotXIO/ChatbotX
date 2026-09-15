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
  name: z.string().trim().min(1).describe("AI function name."),
  purpose: z
    .string()
    .trim()
    .nullish()
    .describe("Description of when the model should call this function."),
  dataCollect: z
    .array(
      z.object({
        from: z.string().trim().min(1),
        to: z.string().trim().min(1),
      }),
    )
    .describe(
      "Field mappings collecting model output into contact/custom fields.",
    ),
  outputMessage: z
    .string()
    .trim()
    .nullish()
    .describe("Message sent to the contact after this function runs."),
  triggerFlowId: zodBigintAsString()
    .nullish()
    .describe("Flow id (numeric string) to start after this function runs."),
})
export type CreateAIFunctionRequest = z.infer<typeof createAIFunctionRequest>

export const updateAIFunctionRequest = createAIFunctionRequest
export type UpdateAIFunctionRequest = z.infer<typeof updateAIFunctionRequest>
