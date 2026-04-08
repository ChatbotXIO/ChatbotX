import { z } from "zod"

export const aiProviders = z.enum(["openai", "gemini", "claude", "deepseek"])
export type AIProvider = z.infer<typeof aiProviders>

export * from "./claude"
export * from "./deepseek"
export * from "./gemini"
export * from "./openai"
