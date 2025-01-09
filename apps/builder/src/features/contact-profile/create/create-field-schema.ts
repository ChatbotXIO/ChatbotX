import { z } from "zod";

export enum FieldType {
  AccountField = "AccountField",
  CustomField = "CustomField",
}

export enum CustomFieldType {
  ShortText = "ShortText",
  Number = "Number",
  Date = "Date",
  DateTime = "DateTime",
  Boolean = "Boolean",
  LongText = "LongText",
}
export const createFieldSchema = z.object({
  name: z.string().min(1).max(255),
  customFieldType: z.nativeEnum(CustomFieldType),
});

export type CreateFieldSchema = z.infer<typeof createFieldSchema>;

export const createFieldBindSchema: [
  fieldType: z.ZodNativeEnum<typeof FieldType>,
  chatbotId: z.ZodString,
] = [z.nativeEnum(FieldType), z.string().cuid2()];

export type CreateFieldBindSchema = [fieldType: string, chatbotId: string];

export interface Field {
  id?: string,
  name: string;
  customFieldType: CustomFieldType;
  value?: string;
}
