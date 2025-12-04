"use client"

import type { AIGenerateTextSchema } from "@aha.chat/flow-config"
import {
  aiGenerateTextDefaultFn,
  aiGenerateTextSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import { AIGenerateTextEditor } from "./editor"
import { AIGenerateTextViewer } from "./viewer"

const AIGenerateTextViewerWrapper = (props: { data: AIGenerateTextSchema }) => (
  <AIGenerateTextViewer data={props.data} />
)

export const aiGenerateTextStep: StepDefinition<AIGenerateTextSchema> = {
  editor: AIGenerateTextEditor,
  viewer: AIGenerateTextViewerWrapper,
  validator: aiGenerateTextSchema,
  defaultFn: () => aiGenerateTextDefaultFn("openai"),
}

// Helper functions to create step definitions for each provider
export const createAIGenerateTextStep = (
  provider: "claude" | "openai" | "gemini" | "deepseek",
): StepDefinition<AIGenerateTextSchema> => ({
  editor: AIGenerateTextEditor,
  viewer: AIGenerateTextViewerWrapper,
  validator: aiGenerateTextSchema,
  defaultFn: () => aiGenerateTextDefaultFn(provider),
})

// Export individual step definitions for backward compatibility
export const openAIGenerateTextStep = createAIGenerateTextStep("openai")
export const claudeGenerateTextStep = createAIGenerateTextStep("claude")
export const geminiGenerateTextStep = createAIGenerateTextStep("gemini")
export const deepseekGenerateTextStep = createAIGenerateTextStep("deepseek")
