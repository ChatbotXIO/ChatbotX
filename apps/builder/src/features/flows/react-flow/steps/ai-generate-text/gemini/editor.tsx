"use client"

import { AI_PROVIDER_CONFIGS } from "../../shared/ai-generate-text/config"
import { GenerateTextEditor } from "../../shared/ai-generate-text/generate-text-editor"
import { GeminiModelSelect } from "./components/model-select"

type GeminiGenerateTextEditorProps = {
  parentName: string
}

export const GeminiGenerateTextEditor = (
  props: GeminiGenerateTextEditorProps,
) => (
  <GenerateTextEditor
    {...props}
    config={AI_PROVIDER_CONFIGS.gemini}
    ModelSelectComponent={GeminiModelSelect}
    provider="gemini"
  />
)
