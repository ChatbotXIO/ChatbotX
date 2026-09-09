import { z } from "zod"

export const claudeModels = z.enum([
  "claude-fable-5",
  "claude-opus-4-8",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-5-20251101",
])
export type ClaudeModel = z.infer<typeof claudeModels>

export const claudeAnalyzeImageModelOptions: {
  label: string
  value: ClaudeModel
}[] = [
  {
    label: "Claude Fable 5",
    value: claudeModels.enum["claude-fable-5"],
  },
  {
    label: "Claude Opus 4.8",
    value: claudeModels.enum["claude-opus-4-8"],
  },
  {
    label: "Claude Opus 4.6",
    value: claudeModels.enum["claude-opus-4-6"],
  },
  {
    label: "Claude Sonnet 4.6",
    value: claudeModels.enum["claude-sonnet-4-6"],
  },
  {
    label: "Claude Haiku 4.5",
    value: claudeModels.enum["claude-haiku-4-5-20251001"],
  },
]

export const claudeModelOptions: { label: string; value: ClaudeModel }[] = [
  {
    label: "Claude Fable 5",
    value: claudeModels.enum["claude-fable-5"],
  },
  {
    label: "Claude Opus 4.8",
    value: claudeModels.enum["claude-opus-4-8"],
  },
  {
    label: "Claude Opus 4.6",
    value: claudeModels.enum["claude-opus-4-6"],
  },
  {
    label: "Claude Sonnet 4.6",
    value: claudeModels.enum["claude-sonnet-4-6"],
  },
  {
    label: "Claude Sonnet 4.5",
    value: claudeModels.enum["claude-sonnet-4-5-20250929"],
  },
  {
    label: "Claude Haiku 4.5",
    value: claudeModels.enum["claude-haiku-4-5-20251001"],
  },
]
