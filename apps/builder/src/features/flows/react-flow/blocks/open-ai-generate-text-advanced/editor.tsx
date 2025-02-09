"use client"

import { FormInput } from "@/components/form-input"
import { NumberField } from "@/components/number-field"
import { Checkbox } from "@/components/ui/checkbox"
import { AITriggersMultipleSelect } from "@/features/ai-triggers/ai-trigger-select"
import { CustomFieldSelect } from "@/features/fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/blocks/open-ai/components/dialog"
import { Controller } from "react-hook-form"
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

      <FormInput
        name={`${parentName}.prompt`}
        label="Prompt"
        inputType="textarea"
        isRequired={false}
      />

      <FormInput name={`${parentName}.userMessage`} label="User Message" />

      <CustomFieldSelect
        name={`${parentName}.resultCustomFieldId`}
        label="Save response to a custom field"
        allowCreate={true}
      />

      <AITriggersMultipleSelect
        name={`${parentName}.aiTriggerIds`}
        isRequired={false}
      />

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
