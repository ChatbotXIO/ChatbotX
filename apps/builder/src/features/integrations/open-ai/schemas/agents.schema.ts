import { z } from "zod"

import { getSortingStateParser } from "@/components/data-table/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAgentSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<Record<string, string>>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  promptId: parseAsString,
})

export type AgentsSchema = Awaited<
  ReturnType<typeof getAgentSearchParamsCache.parse>
> & {
  chatbotId: string
}

export type GetAgentsSchema = Awaited<
  ReturnType<typeof getAgentSearchParamsCache.parse>
> & {
  chatbotId: string
  name: string | null
}

export const createAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateAgentSchema = z.infer<typeof createAgentSchema>

export const createAgentBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateAgentBindSchema = [chatbotId: string, name: string | null]
