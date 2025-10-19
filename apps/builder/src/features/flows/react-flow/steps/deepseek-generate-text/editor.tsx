"use client"

import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"
import { DeepseekDialog } from "../deepseek/components/dialog"
import { DeepseekModelSelect } from "../deepseek/deepseek-model-select"
import { AIModelForm } from "../shared/ai-model-form"

type DeepseekGenerateTextEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
}

export const DeepseekGenerateTextEditor = (
  props: DeepseekGenerateTextEditorProps,
) => (
  <AIModelForm
    dialogComponent={DeepseekDialog}
    flowVersion={props.flowVersion}
    modelSelectComponent={DeepseekModelSelect}
    parentName={props.parentName}
  />
)
