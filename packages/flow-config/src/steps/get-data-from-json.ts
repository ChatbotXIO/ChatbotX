import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const getDataFromJsonStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.getDataFromJson),
  inputCfId: z.cuid2(),
  mapping: z.array(
    z.object({
      jsonPath: z.string().trim().min(1),
      outputCfId: z.cuid2(),
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
