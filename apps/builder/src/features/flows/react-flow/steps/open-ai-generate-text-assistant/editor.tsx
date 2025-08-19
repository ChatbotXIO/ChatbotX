"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { AIAsistantSelect } from "@/features/ai-assistants/ai-assistant-select"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"

type OpenAIGenerateTextAssistantEditorProps = {
  parentName: string
}

export const OpenAIGenerateTextAssistantEditor = (
  props: OpenAIGenerateTextAssistantEditorProps,
) => {
  const { parentName } = props

  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateTextAssistant">
      <AIAsistantSelect name={`${parentName}.aiAssistantId`} />

      <InputField label="User Message" name={`${parentName}.userMessage`} />

      <CustomFieldSelect
        label="Save response to a custom field"
        name={`${parentName}.resultCustomFieldId`}
      />
    </OpenAIDialog>
  )
}
