"use client"

import { FormInput } from "@/components/form-input"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"
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

      <FormInput
        label="Prompt"
        name={`${parentName}.prompt`}
        inputType="textarea"
      />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
        allowCreate={true}
      />
    </OpenAIDialog>
  )
}
