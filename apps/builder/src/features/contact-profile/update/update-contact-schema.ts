import { z } from "zod";

export enum FieldType {
  AccountField = "AccountField",
  CustomField = "CustomField",
}

export enum UpdateContactFieldAction {
  Update = "Update",
  Delete = "Delete",
}

export const updateContactSchema = z.object({
  value: z.string(),
  action: z.nativeEnum(UpdateContactFieldAction),
});

export type UpdateContactSchema = z.infer<typeof updateContactSchema>;

export const updateContactBindSchema: [
  contactId: z.ZodString,
  name: z.ZodString,
  fieldType: z.ZodNativeEnum<typeof FieldType>,
] = [z.string().cuid2(), z.string(), z.nativeEnum(FieldType)];

export type UpdateContactBindSchema = [
  contactId: string,
  name: string,
  fieldType: FieldType,
];
