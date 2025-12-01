import { z } from "zod"

export const ClaudeModel = {
  Claude35Sonnet: "claude-3-5-sonnet-20241022",
  Claude35Haiku: "claude-3-5-haiku-20241022",
  Claude3Opus: "claude-3-opus-20240229",
  Claude3Sonnet: "claude-3-sonnet-20240229",
  Claude3Haiku: "claude-3-haiku-20240307",
} as const

export const claudeSchema = z.object({
  id: z.cuid2(),
  model: z.enum(ClaudeModel),
})
