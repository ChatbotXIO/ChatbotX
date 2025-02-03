import { z } from "zod"

import { getSortingStateParser } from "@/components/data-table/parsers"
import type { AiAssistant } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAiAssistantsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<AiAssistant>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
})

export type GetAiAssistantsSchema = Awaited<
  ReturnType<typeof getAiAssistantsSearchParamsCache.parse>
> & {
  chatbotId: string
}

/**
 * Create
 */
export const createAiAssistantsSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateAiAssistantsSchema = z.infer<typeof createAiAssistantsSchema>

export const createAiAssistantsBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateAiAssistantsBindSchema = [
  chatbotId: string,
  name: string | null,
]

/**
 * Update
 */
const autoVoiceSchema = z.object({
  enable: z.boolean(),
  voice: z.string(),
})

export const updateAiAssistantsSchema = z.object({
  name: z.string().min(1).max(255).trim(),
  json_builder: z.object({
    version: z.string(),
    name: z.string(),
    model: z.string(),
    description: z.nullable(z.string()),
    temperature: z.number(),
    instructions: z.string(),
    file_ids: z.array(z.string()),
    functions: z.array(z.string()),
    autoVoice: autoVoiceSchema,
  }),
})

export type UpdateAiAssistantsSchema = z.infer<typeof updateAiAssistantsSchema>

export const updateAiAssistantsBindSchema: [
  chatbotId: z.ZodString,
  assistantId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAiAssistantsBindSchema = [
  chatbotId: string,
  assistantId: string,
]

/**
 * Delete
 */
export const deleteAiAssistantsBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<z.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAiAssistantsBindSchema = [chatbotId: string, ids: string[]]
