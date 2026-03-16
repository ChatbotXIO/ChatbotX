import z from "zod"
import { allConditions } from "../../conditions/schemas"

export const updateWebhookSchema = z.object({
  conditions: z.array(z.union(Object.values(allConditions))),
  url: z.url().max(1000),
})
export type UpdateWebhookSchema = z.infer<typeof updateWebhookSchema>
