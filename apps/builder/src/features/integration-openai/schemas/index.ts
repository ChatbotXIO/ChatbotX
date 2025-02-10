import type { IntegrationOpenAI } from "@prisma/client"
import { z } from "zod"

export type IntegrationOpenAIResource = IntegrationOpenAI

export const connectOpenAISchema = z.object({
  apiKey: z.string(),
  temperature: z.string().refine(
    (value) => {
      const numValue = Number.parseFloat(value)
      return !Number.isNaN(numValue) && numValue >= 1 && numValue <= 2
    },
    {
      message: "Temperature must be a number between 1 and 2",
    },
  ),
  maxTokens: z.string().refine(
    (value) => {
      const numValue = Number.parseFloat(value)
      return !Number.isNaN(numValue) && numValue >= 1 && numValue <= 8192
    },
    {
      message:
        "Token must be a string with a maximum length of 8192 characters",
    },
  ),
})
export type ConnectOpenAISchema = z.infer<typeof connectOpenAISchema>
