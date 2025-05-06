"use client"

import { InputField } from "@/components/form/input-field"
import { AIAsistantSelect } from "@/features/ai-assistants/ai-assistant-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"

interface OpenAIGenerateTextAssistantEditorProps {
  parentName: string
}

export const OpenAIGenerateTextAssistantEditor = ({
  parentName,
}: OpenAIGenerateTextAssistantEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateTextAssistant">
      <AIAsistantSelect name={`${parentName}.aiAssistantId`} />

      <InputField name={`${parentName}.userMessage`} label="User Message" />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
      />
    </OpenAIDialog>
  )
}
