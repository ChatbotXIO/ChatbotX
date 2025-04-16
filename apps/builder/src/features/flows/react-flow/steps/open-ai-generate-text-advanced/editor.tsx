"use client"

import { CheckboxGroupField } from "@/components/form/checkbox-field"
import { InputField } from "@/components/form/input-field"
import { TextareaField } from "@/components/form/textarea-field"
import { AITriggersMultipleSelect } from "@/features/ai-triggers/ai-trigger-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { OpenAIModel } from "../open-ai/open-ai-model-select"

interface OpenAIGenerateTextAdvancedEditorProps {
  parentName: string
}

export const OpenAIGenerateTextAdvancedEditor = ({
  parentName,
}: OpenAIGenerateTextAdvancedEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateTextAdvanced">
      <OpenAIModel name={`${parentName}.model`} />

      <TextareaField
        name={`${parentName}.prompt`}
        label="Prompt"
        isRequired={false}
      />

      <InputField name={`${parentName}.userMessage`} label="User Message" />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
        allowCreate={true}
      />

      <AITriggersMultipleSelect
        name={`${parentName}.aiTriggerIds`}
        isRequired={false}
      />

      <CheckboxGroupField
        name={`${parentName}.rememberConversation`}
        options={[{ value: "1", label: "Remember Conversation" }]}
      />

      <InputField
        type="number"
        name={`${parentName}.temperature`}
        label="Temperature"
        defaultValue={"0.4"}
      />

      <InputField
        type="number"
        name={`${parentName}.maxTokens`}
        label="Maximum number of output tokens"
        isRequired={false}
        defaultValue={"250"}
      />
    </OpenAIDialog>
  )
}
