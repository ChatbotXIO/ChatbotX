import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const getDataFromJsonStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.getDataFromJson),
  inputFieldId: z.string().trim().min(1),
  mapping: z.array(
    z.object({
      jsonPath: z.string().trim().min(1),
      outputFieldId: z.string().trim().min(1),
    }),
  ),
  states: z.tuple([successStateSchema, errorStateSchema]),
})
export type GetDataFromJsonStepSchema = z.infer<
  typeof getDataFromJsonStepSchema
>

export const getDataFromJsonStepDefaultFn = (): GetDataFromJsonStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.getDataFromJson,
  inputFieldId: "",
  mapping: [
    {
      jsonPath: "",
      outputFieldId: "",
    },
  ],
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
