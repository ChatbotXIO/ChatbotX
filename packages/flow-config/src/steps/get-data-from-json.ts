import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { zodFieldReference } from "../field-reference"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const getDataFromJsonStepSchema = z.object({
  id: zodBigintAsString().describe(
    "Step id (numeric string), unique within the flow.",
  ),
  stepType: z
    .literal(stepTypes.enum.getDataFromJson)
    .describe('Step type discriminator: "getDataFromJson".'),
  inputFieldId: zodFieldReference(),
  mapping: z.array(
    z.object({
      jsonPath: z.string().trim().min(1),
      outputFieldId: zodFieldReference(),
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
