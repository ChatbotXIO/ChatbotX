"use client"

import { AI_PROVIDER_CONFIGS } from "../../shared/ai-generate-text/config"
import { GenerateTextEditor } from "../../shared/ai-generate-text/generate-text-editor"
import { ClaudeModelSelect } from "./components/model-select"

type ClaudeGenerateTextEditorProps = {
  parentName: string
}

export const ClaudeGenerateTextEditor = (
  props: ClaudeGenerateTextEditorProps,
) => (
  <GenerateTextEditor
    {...props}
    config={AI_PROVIDER_CONFIGS.claude}
    ModelSelectComponent={ClaudeModelSelect}
    provider="claude"
  />
)
