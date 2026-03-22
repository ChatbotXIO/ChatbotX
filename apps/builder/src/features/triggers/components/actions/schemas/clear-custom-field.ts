import { TriggerAction } from "@aha.chat/database/enums"
import z from "zod"

export const clearCustomField = z.object({
  type: z.literal(TriggerAction.clearCustomField),
  customFieldId: z.cuid2(),
})
export type ClearCustomField = z.infer<typeof clearCustomField>

export const defaultFn = (): ClearCustomField => ({
  type: TriggerAction.clearCustomField,
  customFieldId: "",
})
