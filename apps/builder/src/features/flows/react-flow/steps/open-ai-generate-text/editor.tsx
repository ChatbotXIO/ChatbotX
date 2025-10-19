"use client"

import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"
import { OpenAIModelSelect } from "../open-ai/open-ai-model-select"
import { AIModelForm } from "../shared/ai-model-form"

type OpenAIGenerateTextEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
}

export const OpenAIGenerateTextEditor = (
  props: OpenAIGenerateTextEditorProps,
) => (
  <AIModelForm
    dialogComponent={OpenAIDialog}
    flowVersion={props.flowVersion}
    modelSelectComponent={OpenAIModelSelect}
    parentName={props.parentName}
  />
)
