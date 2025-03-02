import { CustomFieldType, FieldType } from "@ahachat.ai/database/browser"
import { z } from "zod"

export const createCustomFieldSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  customFieldType: z.nativeEnum(CustomFieldType),
  description: z.string().nullable(),
})
export type CreateCustomFieldSchema = z.infer<typeof createCustomFieldSchema>

export const createAccountFieldSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  customFieldType: z.nativeEnum(CustomFieldType),
  description: z.string().nullable(),
  value: z.string().nullable(),
})
export type CreateAccountFieldSchema = z.infer<typeof createAccountFieldSchema>

export const createFieldBindSchema: [
  chatbotId: z.ZodString,
  parentId: z.ZodNullable<z.ZodString>,
  fieldType: z.ZodNativeEnum<typeof FieldType>,
] = [
  z.string().cuid2().describe("chatbotId"),
  z.string().nullable().describe("folderId"),
  z.nativeEnum(FieldType).describe("fieldType"),
]
export type CreateFieldBindSchema = [
  chatbotId: string,
  folderId: string | null,
  fieldType: FieldType,
]
