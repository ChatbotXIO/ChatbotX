"use client"

import { FormInput } from "@/components/form-input"
import { NumberField } from "@/components/number-field"
import { Checkbox } from "@/components/ui/checkbox"
import { AIAgentSelect } from "@/features/ai-agents/ai-agent-select"
import { AITriggersMultipleSelect } from "@/features/ai-triggers/ai-trigger-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"
import { Controller } from "react-hook-form"
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

      <FormInput name={`${parentName}.userMessage`} label="User Message" />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldid`}
        label="Save response to a custom field"
      />

      <AITriggersMultipleSelect name={`${parentName}.aiTriggerIds`} />

      <FormInput
        name={`${parentName}.rememberConversation`}
        label="Remember Conversation"
      >
        <Controller
          name={`${parentName}.rememberConversation`}
          render={(field) => <Checkbox id="rememberConversation" {...field} />}
        />
      </FormInput>

      <FormInput name={`${parentName}.temperature`} label="Temperature">
        <NumberField value={0.4} max={2} onChange={console.log} />
      </FormInput>

      <FormInput
        name={`${parentName}.maxTokens`}
        label="Maximum number of output tokens"
        isRequired={false}
      >
        <NumberField value={250} step={1} max={4096} onChange={console.log} />
      </FormInput>
    </OpenAIDialog>
  )
}
