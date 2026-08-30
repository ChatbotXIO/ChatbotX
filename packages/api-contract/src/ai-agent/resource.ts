import { aiAgentModel, createSelectSchema } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const publicAiAgentResource = createSelectSchema(aiAgentModel, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})
export type PublicAiAgentResource = z.infer<typeof publicAiAgentResource>

export const publicListAiAgentsResponse = z.object({
  data: z.array(publicAiAgentResource),
  pageCount: z.number().int(),
})
export type PublicListAiAgentsResponse = z.infer<
  typeof publicListAiAgentsResponse
>
