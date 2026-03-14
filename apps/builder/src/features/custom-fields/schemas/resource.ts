import { createSelectSchema, customFieldModel } from "@aha.chat/database/schema"
import type z from "zod"

export const customFieldResource = createSelectSchema(customFieldModel)
export type CustomFieldResource = z.infer<typeof customFieldResource>

export const publicCustomFieldResource = customFieldResource.pick({
  id: true,
  name: true,
  type: true,
  description: true,
})
