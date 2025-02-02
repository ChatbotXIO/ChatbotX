import { z } from "zod"

import { getSortingStateParser } from "@/components/data-table/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"

export const getAssistantSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  sort: getSortingStateParser<Record<string, string>>().withDefault([
    { id: "createdAt", desc: true },
  ]),
  name: parseAsString.withDefault(""),
})

/**
 * Create
 */
export const createAssistantSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateAssistantSchema = z.infer<typeof createAssistantSchema>

export const createAssistantBindSchema: [
  chatbotId: z.ZodString,
  name: z.ZodNullable<z.ZodString>,
] = [z.string().cuid2(), z.string().nullable()]

export type CreateAssistantBindSchema = [chatbotId: string, name: string | null]

/**
 * Update
 */
const autoVoiceSchema = z.object({
  enable: z.boolean(),
  voice: z.string(),
})

export const updateAssistantSchema = z.object({
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

export type UpdateAssistantSchema = z.infer<typeof updateAssistantSchema>

export const updateAssistantBindSchema: [
  chatbotId: z.ZodString,
  assistantId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAssistantBindSchema = [chatbotId: string, assistantId: string]

/**
 * Delete
 */
export const deleteAssistantBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<Zod.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAssistantBindSchema = [chatbotId: string, ids: string[]]
