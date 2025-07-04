import { StepType } from "@ahachat.ai/flow-config"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const getDataFromJsonStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.GET_DATA_FROM_JSON),
  inputCustomFieldId: z.string().cuid2(),
  mapping: z.array(
    z.object({
      jsonPath: z.string().trim().min(1),
      outputCustomFieldId: z.string().cuid2(),
    }),
  ),
})
export type GetDataFromJsonStepSchema = z.infer<
  typeof getDataFromJsonStepSchema
>

export const getDataFromJsonStepDefaultFn = (): GetDataFromJsonStepSchema => ({
  id: createId(),
  stepType: StepType.GET_DATA_FROM_JSON,
  inputCustomFieldId: "",
  mapping: [
    {
      jsonPath: "",
      outputCustomFieldId: "",
    },
  ],
})
