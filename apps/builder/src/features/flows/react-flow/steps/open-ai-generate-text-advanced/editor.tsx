"use client"

import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { InputNumberField } from "@aha.chat/ui/components/form/input-number-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { AITriggerMultiSelect } from "@/features/ai-triggers/ai-trigger-select"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"
import { OpenAIDialog } from "@/features/flows/react-flow/steps/open-ai/components/dialog"
import { OpenAIModelSelect } from "../open-ai/open-ai-model-select"

type OpenAIGenerateTextAdvancedEditorProps = {
  parentName: string
}

export const OpenAIGenerateTextAdvancedEditor = (
  props: OpenAIGenerateTextAdvancedEditorProps,
) => (
  <OpenAIDialog name="Flows.OpenAI.Title.GenerateTextAdvanced">
    <OpenAIModelSelect name={`${props.parentName}.model`} />

    <TextareaField label="Prompt" name={`${props.parentName}.prompt`} />

    <InputField label="User Message" name={`${props.parentName}.userMessage`} />

    <CustomFieldSelect
      allowCreate={true}
      label="Save response to a custom field"
      name={`${props.parentName}.resultCustomFieldId`}
    />

    <AITriggerMultiSelect name={`${props.parentName}.aiTriggerIds`} />

    <CheckboxGroupField
      name={`${props.parentName}.rememberConversation`}
      options={[{ value: "1", label: "Remember Conversation" }]}
    />

    <InputNumberField
      defaultValue={0.4}
      label="Temperature"
      name={`${props.parentName}.temperature`}
    />

    <InputNumberField
      defaultValue={250}
      label="Maximum number of output tokens"
      name={`${props.parentName}.maxTokens`}
    />
  </OpenAIDialog>
)
