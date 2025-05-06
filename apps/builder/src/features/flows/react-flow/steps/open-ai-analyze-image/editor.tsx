"use client"

import { TextareaField } from "@/components/form/textarea-field"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { OpenAIModel } from "../open-ai/open-ai-model-select"

interface OpenAIAnalyzeImageEditorProps {
  parentName: string
}

export const OpenAIAnalyzeImageEditor = ({
  parentName,
}: OpenAIAnalyzeImageEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.AnalyzeImage">
      <OpenAIModel name={`${parentName}.model`} />

      <CustomFieldSelect
        label="Image"
        name={`${parentName}.imageCustomFieldId`}
      />

      <TextareaField label="Prompt" name={`${parentName}.prompt`} />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
        allowCreate={true}
      />
    </OpenAIDialog>
  )
}
