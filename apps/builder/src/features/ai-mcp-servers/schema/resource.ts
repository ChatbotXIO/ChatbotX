import {
  aiMCPServerModel,
  aiMcpServerAuth,
  createSelectSchema,
} from "@aha.chat/database/schema"
import type z from "zod"

export const aiMcpServerResource = createSelectSchema(aiMCPServerModel).extend({
  auth: aiMcpServerAuth,
})
export type AIMcpServerResource = z.infer<typeof aiMcpServerResource>
