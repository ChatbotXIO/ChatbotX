"use client"

import type { AIGenerateImageSchema } from "@aha.chat/flow-config"
import {
  aiGenerateImageDefaultFn,
  aiGenerateImageSchema,
} from "@aha.chat/flow-config"
import type { StepDefinition } from "../definition"
import AIGenerateImageEditor from "./editor"
import AIGenerateImageViewer from "./viewer"

const AIGenerateImageViewerWrapper = (props: {
  data: AIGenerateImageSchema
}) => <AIGenerateImageViewer data={props.data} />

export const aiGenerateImageStep: StepDefinition<AIGenerateImageSchema> = {
  editor: AIGenerateImageEditor,
  viewer: AIGenerateImageViewerWrapper,
  validator: aiGenerateImageSchema,
  defaultFn: aiGenerateImageDefaultFn,
}

export const openAIGenerateImageStep = aiGenerateImageStep
