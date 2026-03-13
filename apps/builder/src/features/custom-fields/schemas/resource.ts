import { createSelectSchema, customFieldModel } from "@aha.chat/database/schema"
import type z from "zod"
import { BaseException } from "@/lib/errors/exception"

export class FieldException extends BaseException {}

export const customFieldResource = createSelectSchema(customFieldModel)
export type CustomFieldResource = z.infer<typeof customFieldResource>

export const publicCustomFieldResource = customFieldResource.pick({
  id: true,
  name: true,
  type: true,
  description: true,
})
