import { z } from "zod"

import { getSortingStateParser } from "@/components/data-table/parsers"
import type { AiAgent } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAiAgentSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AiAgent>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
  promptId: parseAsString,
})

export type AiAgentsSchema = Awaited<
  ReturnType<typeof getAiAgentSearchParamsCache.parse>
> & {
  chatbotId: string
}

export type GetAiAgentsSchema = Awaited<
  ReturnType<typeof getAiAgentSearchParamsCache.parse>
> & {
  chatbotId: string
}

export const createAiAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateAiAgentSchema = z.infer<typeof createAiAgentSchema>

export const createAiAgentBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateAiAgentBindSchema = [chatbotId: string, name: string | null]

/**
 * Delete
 */
export const deleteAiAgentBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<z.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAiAgentBindSchema = [chatbotId: string, ids: string[]]

/**
 * Update
 */
const messageSchema = z.object({
  role: z.enum(["user", "agent"]).default("user"),
  content: z.string(),
})

export const updateAiAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  json_builder: z
    .object({
      system: z.string().optional(),
      messages: z.array(messageSchema).optional(),
    })
    .optional(),
})

export type UpdateAiAgentSchema = z.infer<typeof updateAiAgentSchema>

export const updateAiAgentBindSchema: [
  chatbotId: z.ZodString,
  agentId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAiAgentBindSchema = [chatbotId: string, agentId: string]
