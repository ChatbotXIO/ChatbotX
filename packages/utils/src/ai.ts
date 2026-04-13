import { z } from "zod"

export const aiProviders = z.enum(["openai", "gemini", "claude", "deepseek"])
export type AIProvider = z.infer<typeof aiProviders>
