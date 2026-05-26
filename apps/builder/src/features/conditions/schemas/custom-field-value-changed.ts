import {
  operatorTypes,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import z from "zod"

export const customFieldValueChanged = z.object({
  id: z.string().optional(),
  type: z.literal(triggerEventTypes.enum.customFieldValueChanged),
  sourceId: z.string().min(1, "Campo personalizado é obrigatório"),
  operator: z.string(),
  value: z.unknown(),
})
export type CustomFieldValueChanged = z.infer<typeof customFieldValueChanged>

export const defaultFn = (): CustomFieldValueChanged => ({
  type: triggerEventTypes.enum.customFieldValueChanged,
  sourceId: "",
  operator: operatorTypes.enum.eq,
  value: "",
})
