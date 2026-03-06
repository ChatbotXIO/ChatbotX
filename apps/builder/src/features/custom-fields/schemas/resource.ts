import { createSelectSchema, fieldModel } from "@aha.chat/database/schema"
import type z from "zod"
import { BaseException } from "@/lib/errors/exception"

export class FieldException extends BaseException {}

export const customFieldResource = createSelectSchema(fieldModel)
export type CustomFieldResource = z.infer<typeof customFieldResource>
