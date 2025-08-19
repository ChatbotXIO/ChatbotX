"use client"

import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { AIAgentSelect } from "@/features/ai-agents/ai-agent-select"
import { AITriggersMultipleSelect } from "@/features/ai-triggers/ai-trigger-select"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { OpenAIModelSelect } from "../open-ai/open-ai-model-select"

type OpenAIGenerateTextAgentEditorProps = {
  parentName: string
}

export const OpenAIGenerateTextAgentEditor = (
  props: OpenAIGenerateTextAgentEditorProps,
) => {
  const { parentName } = props

  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateTextAgent">
      <OpenAIModelSelect name={`${parentName}.model`} />

      <AIAgentSelect name={`${parentName}.aiAgentId`} />

      <InputField label="User Message" name={`${parentName}.userMessage`} />

      <CustomFieldSelect
        label="Save response to a custom field"
        name={`${parentName}.resultCustomFieldid`}
      />

      <AITriggersMultipleSelect name={`${parentName}.aiTriggerIds`} />

      <CheckboxGroupField
        name={`${parentName}.rememberConversation`}
        options={[{ value: "1", label: "Remember Conversation" }]}
      />

      <InputNumberField
        defaultValue={0.4}
        label="Temperature"
        name={`${parentName}.temperature`}
      />

      <InputNumberField
        defaultValue={250}
        isRequired={false}
        label="Maximum number of output tokens"
        name={`${parentName}.maxTokens`}
      />
    </OpenAIDialog>
  )
}
