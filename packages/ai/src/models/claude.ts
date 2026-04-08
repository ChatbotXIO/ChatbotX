import { z } from "zod"

export const claudeModels = z.enum([
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
])
export type ClaudeModel = z.infer<typeof claudeModels>

export const claudeModelOptions: { label: string; value: ClaudeModel }[] = [
  {
    label: "Claude 3.5 Sonnet",
    value: claudeModels.enum["claude-3-5-sonnet-20241022"],
  },
  {
    label: "Claude 3.5 Haiku",
    value: claudeModels.enum["claude-3-5-haiku-20241022"],
  },
  {
    label: "Claude 3 Opus",
    value: claudeModels.enum["claude-3-opus-20240229"],
  },
  {
    label: "Claude 3 Sonnet",
    value: claudeModels.enum["claude-3-sonnet-20240229"],
  },
  {
    label: "Claude 3 Haiku",
    value: claudeModels.enum["claude-3-haiku-20240307"],
  },
]
