import { FieldType } from "@ahachat.ai/database";
import { z } from "zod";

const FieldTypeEnum = z.nativeEnum(FieldType);

export const deleteFieldBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<Zod.ZodString>,
  fieldType: typeof FieldTypeEnum
] = [
    z.string().cuid2(),
    z.array(z.string().cuid2()),
    FieldTypeEnum,
  ]

export type DeleteFieldBindSchema = [chatbotId: string, ids: string[], fieldType: FieldType]
