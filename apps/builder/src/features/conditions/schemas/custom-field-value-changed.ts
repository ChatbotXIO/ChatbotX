import { Condition, Operator } from "@aha.chat/database/enums"
import z from "zod"

export const customFieldValueChanged = z.object({
  id: z.string().optional(),
  type: z.literal(Condition.customFieldValueChanged),
  sourceId: z.string().min(1, "Custom field is required"),
  operator: z.string(),
  value: z.unknown(),
})
export type CustomFieldValueChanged = z.infer<typeof customFieldValueChanged>

export const defaultFn = (): CustomFieldValueChanged => ({
  type: Condition.customFieldValueChanged,
  sourceId: "",
  operator: Operator.is,
  value: "",
})
