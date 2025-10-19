"use client"

import type { FlowVersionResource } from "@/features/flows/schemas/get-flows-schema"
import { ClaudeModelSelect } from "../claude/claude-model-select"
import { ClaudeDialog } from "../claude/components/dialog"
import { AIModelForm } from "../shared/ai-model-form"

type ClaudeGenerateTextEditorProps = {
  parentName: string
  flowVersion: FlowVersionResource
}

export const ClaudeGenerateTextEditor = (
  props: ClaudeGenerateTextEditorProps,
) => (
  <AIModelForm
    dialogComponent={ClaudeDialog}
    flowVersion={props.flowVersion}
    modelSelectComponent={ClaudeModelSelect}
    parentName={props.parentName}
  />
)
