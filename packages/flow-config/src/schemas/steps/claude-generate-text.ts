import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

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

export const claudeGenerateTextSchema = claudeSchema.extend({
  stepType: z.literal(StepType.CLAUDE_GENERATE_TEXT),
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.union([z.cuid2(), z.literal("")]).optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(250).max(4096),
})

export type ClaudeGenerateTextSchema = z.infer<typeof claudeGenerateTextSchema>

export const claudeGenerateTextDefaultFn = (): ClaudeGenerateTextSchema => ({
  id: createId(),
  stepType: StepType.CLAUDE_GENERATE_TEXT,
  model: ClaudeModel.Claude35Sonnet,
  prompt: "",
  userMessage: "",
  resultCustomFieldId: undefined,
  tools: [],
  rememberConversation: true,
  temperature: 1.0,
  maxTokens: 250,
})
