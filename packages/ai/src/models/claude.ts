import { z } from "zod"

export const claudeModels = z.enum([
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-4.6-opus",
  "claude-4.5-haiku-20251001",
  "claude-4.5-sonnet-20250929",
  "claude-4.5-opus-20251101",
])
export type ClaudeModel = z.infer<typeof claudeModels>

export const claudeAnalyzeImageModelOptions: {
  label: string
  value: ClaudeModel
}[] = [
  {
    label: "Claude Opus 4.6",
    value: claudeModels.enum["claude-4.6-opus"],
  },
  {
    label: "Claude 4.5 Haiku (2025-October-01)",
    value: claudeModels.enum["claude-4.5-haiku-20251001"],
  },
  {
    label: "Claude Sonnet 4.5 (2025-September-29)",
    value: claudeModels.enum["claude-4.5-sonnet-20250929"],
  },
  {
    label: "Claude Opus 4.5 (2025-November-01)",
    value: claudeModels.enum["claude-4.5-opus-20251101"],
  },
  {
    label: "Claude 3.5 Haiku (2024-10-22)",
    value: claudeModels.enum["claude-3-5-haiku-20241022"],
  },
]

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
