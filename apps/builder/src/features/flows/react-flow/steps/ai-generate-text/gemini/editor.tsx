"use client"

import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"
import { AI_PROVIDER_CONFIGS } from "../../shared/ai-generate-text/config"
import { GenerateTextEditor } from "../../shared/ai-generate-text/generate-text-editor"
import { GeminiModelSelect } from "./components/model-select"

type GeminiGenerateTextEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
}

export const GeminiGenerateTextEditor = (
  props: GeminiGenerateTextEditorProps,
) => (
  <GenerateTextEditor
    {...props}
    provider="gemini"
    config={AI_PROVIDER_CONFIGS.gemini}
    ModelSelectComponent={GeminiModelSelect}
  />
)
