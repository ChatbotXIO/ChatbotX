"use client"

import { FormInput } from "@/components/form-input"
import { AIAsistantSelect } from "@/features/ai-assistants/ai-assistant-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"

interface OpenAIGenerateTextAssistantEditorProps {
  parentName: string
}

export const OpenAIGenerateTextAssistantEditor = ({
  parentName,
}: OpenAIGenerateTextAssistantEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateTextAssistant">
      <AIAsistantSelect name={`${parentName}.aiAssistantId`} />

      <FormInput name={`${parentName}.userMessage`} label="User Message" />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
      />
    </OpenAIDialog>
  )
}
