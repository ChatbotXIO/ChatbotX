import { z } from "zod"

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
