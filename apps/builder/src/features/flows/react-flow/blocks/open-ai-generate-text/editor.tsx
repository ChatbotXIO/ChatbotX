"use client"

import { FormInput } from "@/components/form-input"
import { AITriggersMultipleSelect } from "@/features/ai-triggers/ai-trigger-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"
import { OpenAIModel } from "../open-ai/open-ai-model-select"

interface OpenAIGenerateTextEditorProps {
  parentName: string
}

export const OpenAIGenerateTextEditor = ({
  parentName,
}: OpenAIGenerateTextEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateText">
      <OpenAIModel name={`${parentName}.model`} />

      <FormInput
        label="Prompt"
        name={`${parentName}.prompt`}
        isRequired={false}
        inputType="textarea"
      />

      <FormInput label="User Message" name={`${parentName}.userMessage`} />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
        allowCreate={true}
      />

      <AITriggersMultipleSelect
        name={`${parentName}.aiTriggerIds`}
        isRequired={false}
      />
    </OpenAIDialog>
  )
}
