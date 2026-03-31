import { z } from "zod"

export const claudeModels = z.enum([
  "anthropic/claude-3-5-sonnet-20241022",
  "anthropic/claude-3-5-haiku-20241022",
  "anthropic/claude-3-opus-20240229",
  "anthropic/claude-3-sonnet-20240229",
  "anthropic/claude-3-haiku-20240307",
])

export const claudeModelOptions = [
  {
    label: "Claude 3.5 Sonnet",
    value: claudeModels.enum["anthropic/claude-3-5-sonnet-20241022"],
  },
  {
    label: "Claude 3.5 Haiku",
    value: claudeModels.enum["anthropic/claude-3-5-haiku-20241022"],
  },
  {
    label: "Claude 3 Opus",
    value: claudeModels.enum["anthropic/claude-3-opus-20240229"],
  },
  {
    label: "Claude 3 Sonnet",
    value: claudeModels.enum["anthropic/claude-3-sonnet-20240229"],
  },
  {
    label: "Claude 3 Haiku",
    value: claudeModels.enum["anthropic/claude-3-haiku-20240307"],
  },
]
