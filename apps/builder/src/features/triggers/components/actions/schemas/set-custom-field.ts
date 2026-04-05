import { triggerActions } from "@chatbotx.io/database/partials"
import { FieldOperationType } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const setCustomField = z.object({
  type: z.literal(triggerActions.enum.setCustomField),
  customFieldId: zodBigintAsString(),
  operation: z.enum(FieldOperationType),
  value: z.string(),
})
export type SetCustomField = z.infer<typeof setCustomField>

export const defaultFn = (): SetCustomField => ({
  type: triggerActions.enum.setCustomField,
  customFieldId: "",
  operation: FieldOperationType.set,
  value: "",
})
