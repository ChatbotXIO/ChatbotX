import { triggerActions } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const clearCustomField = z.object({
  type: z.literal(triggerActions.enum.clearCustomField),
  customFieldId: zodBigintAsString(),
})
export type ClearCustomField = z.infer<typeof clearCustomField>

export const defaultFn = (): ClearCustomField => ({
  type: triggerActions.enum.clearCustomField,
  customFieldId: "",
})
