import { triggerActions } from "@chatbotx.io/database/partials"
import { zodFieldReference } from "@chatbotx.io/flow-config"
import z from "zod"

export const clearCustomField = z.object({
  type: z.literal(triggerActions.enum.clearCustomField),
  customFieldId: zodFieldReference(),
})
export type ClearCustomField = z.infer<typeof clearCustomField>

export const defaultFn = (): ClearCustomField => ({
  type: triggerActions.enum.clearCustomField,
  customFieldId: "",
})
