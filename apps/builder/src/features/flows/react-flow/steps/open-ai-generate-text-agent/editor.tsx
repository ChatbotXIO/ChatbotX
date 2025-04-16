"use client"

import { CheckboxGroupField } from "@/components/form/checkbox-field"
import { InputField } from "@/components/form/input-field"
import { AIAgentSelect } from "@/features/ai-agents/ai-agent-select"
import { AITriggersMultipleSelect } from "@/features/ai-triggers/ai-trigger-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { OpenAIModel } from "../open-ai/open-ai-model-select"

interface OpenAIGenerateTextAgentEditorProps {
  parentName: string
}

export const OpenAIGenerateTextAgentEditor = ({
  parentName,
}: OpenAIGenerateTextAgentEditorProps) => {
  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateTextAgent">
      <OpenAIModel name={`${parentName}.model`} />

      <AIAgentSelect name={`${parentName}.aiAgentId`} />

      <InputField name={`${parentName}.userMessage`} label="User Message" />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldid`}
        label="Save response to a custom field"
      />

      <AITriggersMultipleSelect name={`${parentName}.aiTriggerIds`} />

      <CheckboxGroupField
        name={`${parentName}.rememberConversation`}
        options={[{ value: "1", label: "Remember Conversation" }]}
      />

      <InputField
        type="number"
        name={`${parentName}.temperature`}
        label="Temperature"
        defaultValue="0.4"
      />

      <InputField
        name={`${parentName}.maxTokens`}
        label="Maximum number of output tokens"
        isRequired={false}
        defaultValue="250"
      />
    </OpenAIDialog>
  )
}
