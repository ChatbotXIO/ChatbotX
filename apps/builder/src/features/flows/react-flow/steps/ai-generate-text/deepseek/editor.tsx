"use client"

import { AI_PROVIDER_CONFIGS } from "../../shared/ai-generate-text/config"
import { GenerateTextEditor } from "../../shared/ai-generate-text/generate-text-editor"
import { DeepseekModelSelect } from "./components/model-select"

type DeepseekGenerateTextEditorProps = {
  parentName: string
}

export const DeepseekGenerateTextEditor = (
  props: DeepseekGenerateTextEditorProps,
) => (
  <GenerateTextEditor
    {...props}
    config={AI_PROVIDER_CONFIGS.deepseek}
    ModelSelectComponent={DeepseekModelSelect}
    provider="deepseek"
  />
)
