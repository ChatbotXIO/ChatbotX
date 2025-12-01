"use client"

import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"
import { AI_PROVIDER_CONFIGS } from "../../shared/ai-generate-text/config"
import { GenerateTextEditor } from "../../shared/ai-generate-text/generate-text-editor"
import { OpenAIModelSelect } from "./components/model-select"

type OpenAIGenerateTextEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
}

export const OpenAIGenerateTextEditor = (
  props: OpenAIGenerateTextEditorProps,
) => (
  <GenerateTextEditor
    {...props}
    config={AI_PROVIDER_CONFIGS.openai}
    ModelSelectComponent={OpenAIModelSelect}
    provider="openai"
  />
)
