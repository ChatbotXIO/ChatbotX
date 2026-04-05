import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const getDataFromJsonStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.getDataFromJson),
  inputCfId: zodBigintAsString(),
  mapping: z.array(
    z.object({
      jsonPath: z.string().trim().min(1),
      outputCfId: zodBigintAsString(),
    }),
  ),
})
export type GetDataFromJsonStepSchema = z.infer<
  typeof getDataFromJsonStepSchema
>

export const getDataFromJsonStepDefaultFn = (): GetDataFromJsonStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.getDataFromJson,
  inputCfId: "",
  mapping: [
    {
      jsonPath: "",
      outputCfId: "",
    },
  ],
})
