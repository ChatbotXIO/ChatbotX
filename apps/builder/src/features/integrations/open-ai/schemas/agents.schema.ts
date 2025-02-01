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

/**
 * Delete
 */
export const deleteAgentBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<Zod.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAgentBindSchema = [chatbotId: string, ids: string[]]

/**
 * Update
 */
const messageSchema = z.object({
  role: z.enum(["user", "agent"]),
  content: z.string(),
})

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  json_builder: z
    .object({
      system: z.string().optional(),
      messages: z.array(messageSchema).optional(),
    })
    .optional(),
})

export type UpdateAgentSchema = z.infer<typeof updateAgentSchema>

export const updateAgentBindSchema: [
  chatbotId: z.ZodString,
  agentId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAgentBindSchema = [chatbotId: string, agentId: string]
