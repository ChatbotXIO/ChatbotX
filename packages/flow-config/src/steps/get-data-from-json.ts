import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const getDataFromJsonStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.getDataFromJson),
  inputCfId: z.bigint(),
  mapping: z.array(
    z.object({
      jsonPath: z.string().trim().min(1),
      outputCfId: z.bigint(),
    }),
  ),
})
export type GetDataFromJsonStepSchema = z.infer<
  typeof getDataFromJsonStepSchema
>

export const getDataFromJsonStepDefaultFn = (): GetDataFromJsonStepSchema => ({
  id: createId(),
  stepType: StepType.getDataFromJson,
  inputCfId: "",
  mapping: [
    {
      jsonPath: "",
      outputCfId: "",
    },
  ],
})
