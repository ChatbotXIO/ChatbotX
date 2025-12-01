"use client"

import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"
import { AI_PROVIDER_CONFIGS } from "../../shared/ai-generate-text/config"
import { GenerateTextEditor } from "../../shared/ai-generate-text/generate-text-editor"
import { DeepseekModelSelect } from "./components/model-select"

type DeepseekGenerateTextEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
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
