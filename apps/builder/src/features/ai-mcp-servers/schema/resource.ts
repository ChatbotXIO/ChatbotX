import { aiMcpServerAuth } from "@chatbotx.io/database/partials"
import {
  aiMCPServerModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const aiMcpServerResource = createSelectSchema(aiMCPServerModel).extend({
  auth: aiMcpServerAuth,
  availableTools: z.record(z.string(), z.any()),
})
export type AIMcpServerResource = z.infer<typeof aiMcpServerResource>
