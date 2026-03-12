import { createSelectSchema, fieldModel } from "@aha.chat/database/schema"
import type z from "zod"

export const accountFieldResource = createSelectSchema(fieldModel)
export type AccountFieldResource = z.infer<typeof accountFieldResource>

export const publicAccountFieldResource = accountFieldResource.pick({
  id: true,
  name: true,
  customFieldType: true,
  value: true,
})
