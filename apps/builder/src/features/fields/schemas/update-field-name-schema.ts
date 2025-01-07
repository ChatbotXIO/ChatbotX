import { z } from "zod";

import { FieldType } from "@ahachat.ai/database";

const FieldTypeEnum = z.nativeEnum(FieldType);

export const updateFieldNameSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  description: z.string().optional(),
})
export type UpdateFieldNameSchema = z.infer<typeof updateFieldNameSchema>

export const updateFieldNameBindSchema: [
  chatbotId: z.ZodString,
  fieldId: z.ZodString,
  fieldType: typeof FieldTypeEnum
] = [
    z.string().cuid2(),
    z.string().cuid2(),
    FieldTypeEnum,
  ]

export type UpdateFieldNameBindSchema = [chatbotId: string, fieldId: string, fieldType: FieldType]
