import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { zodFieldReference } from "../field-reference"
import { stepTypes } from "./step-action"

export const clearCustomFieldStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.clearCustomField),
  inputFieldId: zodFieldReference(),
})

export type ClearCustomFieldStepSchema = z.infer<
  typeof clearCustomFieldStepSchema
>

export const clearCustomFieldStepDefaultFn = (
  props?: Partial<ClearCustomFieldStepSchema>,
): ClearCustomFieldStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.clearCustomField,
  inputFieldId: "",
  ...props,
})
