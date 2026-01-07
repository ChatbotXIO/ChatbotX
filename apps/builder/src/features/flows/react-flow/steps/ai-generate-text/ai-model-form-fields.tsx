"use client"

import { CheckboxGroupField } from "@aha.chat/ui/components/form/checkbox-field"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { TextareaField } from "@aha.chat/ui/components/form/textarea-field"
import { useTranslations } from "next-intl"
import { useAIToolOptions } from "@/features/ai-triggers/use-ai-tools"
import { CustomFieldSelect } from "@/features/custom-fields/custom-field-select"

type AIModelFormFieldsProps = {
  modelSelectComponent: React.ComponentType<{ name: string }>
}

export const AIModelFormFields = ({
  modelSelectComponent: ModelSelectComponent,
}: AIModelFormFieldsProps) => {
  const t = useTranslations()
  const toolOptions = useAIToolOptions()

  return (
    <div className="space-y-4">
      <ModelSelectComponent name="model" />

      <TextareaField label={t("fields.prompt.label")} name="prompt" />

      <InputField
        label={t("fields.userMessage.label")}
        name="userMessage"
        required
      />

      <CustomFieldSelect
        allowCreate={true}
        includeReserved={true}
        label={t("fields.outputCfId.label")}
        name="outputCfId"
        required
      />

      <MultiSelectField
        label={t("fields.tools.label")}
        name="tools"
        options={toolOptions}
      />

      <CheckboxGroupField
        name="rememberConversation"
        options={[
          { value: "1", label: t("fields.rememberConversation.label") },
        ]}
      />

      <InputField
        label={t("fields.temperature.label")}
        name="temperature"
        placeholder={t("fields.placeholders.temperatureHint")}
        required
        type="number"
      />

      <InputField
        label={t("fields.maxTokens.label")}
        name="maxTokens"
        placeholder={t("fields.placeholders.maxTokensHint")}
        type="number"
      />
    </div>
  )
}
