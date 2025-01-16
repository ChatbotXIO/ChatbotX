import { FieldType } from "@ahachat.ai/database"
import { z } from "zod"

export const deleteFieldBindSchema: [
  chatbotId: z.ZodString,
  fieldType: z.ZodNativeEnum<typeof FieldType>,
  ids: z.ZodArray<Zod.ZodString>,
] = [z.string().cuid2(), z.nativeEnum(FieldType), z.array(z.string().cuid2())]

export type DeleteFieldBindSchema = [
  chatbotId: string,
  fieldType: FieldType,
  ids: string[],
]
