import z from "zod"
import { aiAgentResourceSchema } from "./resource"

export const listAIAgentsRequest = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).default(10),
  sort: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .default([{ id: "createdAt", desc: true }]),
  name: z.string().optional(),
})

export type ListAIAgentsRequest = z.infer<typeof listAIAgentsRequest> & {
  chatbotId: string
}

export const listAIAgentsResponse = z.object({
  data: z.array(aiAgentResourceSchema),
  pageCount: z.number().int().min(1),
})
