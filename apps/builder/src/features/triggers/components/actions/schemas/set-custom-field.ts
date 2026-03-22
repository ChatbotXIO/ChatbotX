import { TriggerAction } from "@aha.chat/database/enums"
import { FieldOperationType } from "@aha.chat/flow-config"
import z from "zod"

export const setCustomField = z.object({
  type: z.literal(TriggerAction.setCustomField),
  customFieldId: z.cuid2(),
  operation: z.enum(FieldOperationType),
  value: z.string(),
})
export type SetCustomField = z.infer<typeof setCustomField>

export const defaultFn = (): SetCustomField => ({
  type: TriggerAction.setCustomField,
  customFieldId: "",
  operation: FieldOperationType.set,
  value: "",
})
