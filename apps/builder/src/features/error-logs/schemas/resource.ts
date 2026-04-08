import { createSelectSchema, errorLogModel } from "@chatbotx.io/database/schema"
import z from "zod"

export const errorLogResource = createSelectSchema(errorLogModel, {
  id: z.string(),
  workspaceId: z.string(),
  contactId: z.string().nullable(),
})
export type ErrorLogResource = z.infer<typeof errorLogResource>
