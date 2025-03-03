import { FieldType } from "@ahachat.ai/database/browser"
import { z } from "zod"

const FieldTypeEnum = z.nativeEnum(FieldType)

export const updateCustomFieldSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().optional(),
})
export type UpdateCustomFieldSchema = z.infer<typeof updateCustomFieldSchema>

export const updateFieldBindSchema: [
  chatbotId: z.ZodString,
  fieldId: z.ZodString,
  fieldType: typeof FieldTypeEnum,
] = [z.string().cuid2(), z.string().cuid2(), FieldTypeEnum]

export type UpdateFieldBindSchema = [
  chatbotId: string,
  fieldId: string,
  fieldType: FieldType,
]
