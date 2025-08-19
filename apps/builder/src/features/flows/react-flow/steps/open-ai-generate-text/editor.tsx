"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { AITriggersMultipleSelect } from "@/features/ai-triggers/ai-trigger-select"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { OpenAIModelSelect } from "../open-ai/open-ai-model-select"

type OpenAIGenerateTextEditorProps = {
  parentName: string
}

export const OpenAIGenerateTextEditor = (
  props: OpenAIGenerateTextEditorProps,
) => {
  const { parentName } = props

  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateText">
      <OpenAIModelSelect name={`${parentName}.model`} />

      <TextareaField
        isRequired={false}
        label="Prompt"
        name={`${parentName}.prompt`}
      />

      <InputField label="User Message" name={`${parentName}.userMessage`} />

      <CustomFieldSelect
        allowCreate={true}
        label="Save response to a custom field"
        name={`${parentName}.resultCustomFieldId`}
      />

      <AITriggersMultipleSelect
        isRequired={false}
        name={`${parentName}.aiTriggerIds`}
      />
    </OpenAIDialog>
  )
}
