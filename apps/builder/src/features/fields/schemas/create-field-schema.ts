import { CustomFieldType, FieldType } from "@ahachat.ai/database";
import { z } from "zod";

const CustomFieldTypeEnum = z.nativeEnum(CustomFieldType);
const FieldTypeEnum = z.nativeEnum(FieldType);

export const createFieldSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  customFieldType: CustomFieldTypeEnum,
  description: z.string().optional(),
  value: z.string().optional(),
  showInInbox: z.boolean(),
});

export type CreateFieldSchema = z.infer<typeof createFieldSchema>;

export const createFieldBindSchema: [
  chatbotId: z.ZodString,
  folderId: z.ZodNullable<z.ZodString>,
  fieldType: typeof FieldTypeEnum
] = [
    z.string().cuid2(),
    z.string().nullable(),
    FieldTypeEnum,
  ];

export type CreateFieldBindSchema = [chatbotId: string, folderId: string | null, fieldType: FieldType];
