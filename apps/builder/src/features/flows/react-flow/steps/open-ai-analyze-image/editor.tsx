"use client"

import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { OpenAIModelSelect } from "../open-ai/open-ai-model-select"

type OpenAIAnalyzeImageEditorProps = {
  parentName: string
}

export const OpenAIAnalyzeImageEditor = (
  props: OpenAIAnalyzeImageEditorProps,
) => {
  const { parentName } = props

  return (
    <OpenAIDialog name="Flows.OpenAI.Title.AnalyzeImage">
      <OpenAIModelSelect name={`${parentName}.model`} />

      <CustomFieldSelect
        label="Image"
        name={`${parentName}.imageCustomFieldId`}
      />

      <TextareaField label="Prompt" name={`${parentName}.prompt`} />

      <CustomFieldSelect
        allowCreate={true}
        label="Save response to a custom field"
        name={`${parentName}.resultCustomFieldId`}
      />
    </OpenAIDialog>
  )
}
