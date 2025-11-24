import {
  ConditionField,
  ConditionFieldType,
  ConditionOperator,
} from "@aha.chat/database"
import z from "zod"

export const condition = z.object({
  field: z.enum(ConditionField),
  operator: z.enum(ConditionOperator),
  value: z.any(),
})
export type Condition = z.infer<typeof condition>

export const conditionChild = z.object({
  field: z.enum(ConditionField),
  type: z.enum(ConditionFieldType),
  label: z.string(),
})
export type ConditionChild = z.infer<typeof conditionChild>

export type ConditionFieldList = {
  groupName: string
  children: ConditionChild[]
}
