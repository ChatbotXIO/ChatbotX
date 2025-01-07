import { z } from "zod";

import { FieldType } from "@ahachat.ai/database";

const FieldTypeEnum = z.nativeEnum(FieldType);

export const updateFieldValueSchema = z.object({
  value: z.string().optional(),
})
export type UpdateFieldValueSchema = z.infer<typeof updateFieldValueSchema>

export const updateFieldValueBindSchema: [
  chatbotId: z.ZodString,
  fieldId: z.ZodString,
  fieldType: typeof FieldTypeEnum
] = [
    z.string().cuid2(),
    z.string().cuid2(),
    FieldTypeEnum,
  ]

export type UpdateFieldValueBindSchema = [chatbotId: string, fieldId: string, fieldType: FieldType]
