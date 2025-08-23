"use client"

import { InputField } from "@aha.chat/ui/components/form/input-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { useTranslations } from "next-intl"
import { AITriggerMultiSelect } from "@/features/ai-triggers/ai-trigger-select"
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
  const t = useTranslations()

  return (
    <OpenAIDialog name="Flows.OpenAI.Title.GenerateText">
      <OpenAIModelSelect name={`${parentName}.model`} />

      <TextareaField
        isRequired={false}
        label="Prompt"
        name={`${parentName}.prompt`}
      />

      <InputField
        label={t("fields.userMessage.label")}
        name={`${parentName}.userMessage`}
      />

      <CustomFieldSelect
        allowCreate={true}
        label="Save response to a custom field"
        name={`${parentName}.resultCustomFieldId`}
      />

      <AITriggerMultiSelect
        isRequired={false}
        name={`${parentName}.aiTriggerIds`}
      />
    </OpenAIDialog>
  )
}
