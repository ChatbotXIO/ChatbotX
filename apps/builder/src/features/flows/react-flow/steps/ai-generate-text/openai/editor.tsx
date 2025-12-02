"use client"

import { AI_PROVIDER_CONFIGS } from "../../shared/ai-generate-text/config"
import { GenerateTextEditor } from "../../shared/ai-generate-text/generate-text-editor"
import { OpenAIModelSelect } from "./components/model-select"

type OpenAIGenerateTextEditorProps = {
  parentName: string
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
