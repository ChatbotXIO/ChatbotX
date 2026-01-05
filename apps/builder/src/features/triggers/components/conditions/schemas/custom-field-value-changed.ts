import { Operator, TriggerCondition } from "@aha.chat/database/enums"
import z from "zod"

export const customFieldValueChanged = z.object({
  type: z.literal(TriggerCondition.customFieldValueChanged),
  customFieldId: z.string(),
  operator: z.enum(Operator),
  value: z.union([z.string(), z.array(z.string())]),
})
export type CustomFieldValueChanged = z.infer<typeof customFieldValueChanged>

export const defaultFn = (): CustomFieldValueChanged => ({
  type: TriggerCondition.customFieldValueChanged,
  customFieldId: "",
  operator: Operator.is,
  value: "",
})
