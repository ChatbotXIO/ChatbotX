"use client"

import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"
import { GeminiDialog } from "../gemini/components/dialog"
import { GeminiModelSelect } from "../gemini/gemini-model-select"
import { AIModelForm } from "../shared/ai-model-form"

type GeminiGenerateTextEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
}

export const GeminiGenerateTextEditor = (
  props: GeminiGenerateTextEditorProps,
) => (
  <AIModelForm
    dialogComponent={GeminiDialog}
    flowVersion={props.flowVersion}
    modelSelectComponent={GeminiModelSelect}
    parentName={props.parentName}
  />
)
