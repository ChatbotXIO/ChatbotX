import { z } from "zod"

export const GeminiModel = {
  Gemini25Pro: "gemini-2.5-pro",
  Gemini25Flash: "gemini-2.5-flash",
} as const

export const geminiSchema = z.object({
  id: z.cuid2(),
  model: z.enum(GeminiModel),
})
