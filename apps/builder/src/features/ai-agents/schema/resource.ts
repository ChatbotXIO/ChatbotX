import { aiAgentModel, createSelectSchema } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const aiAgentResourceSchema = createSelectSchema(aiAgentModel, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
