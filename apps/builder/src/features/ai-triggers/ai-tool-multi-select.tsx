"use client"

import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { useTranslations } from "next-intl"
import { useAITools } from "./use-ai-tools"

type AIToolMultiSelectProps = {
  name: string
  required?: boolean
}

export function AIToolMultiSelect(props: AIToolMultiSelectProps) {
  const t = useTranslations()
  const { toolOptions, loading, error } = useAITools()

  return (
    <MultiSelectField
      disabled={loading || !!error}
      label={t("fields.tools.label")}
      options={toolOptions}
      placeholder={
        loading
          ? t("fields.placeholders.loading")
          : t("fields.placeholders.selectTools")
      }
      {...props}
    />
  )
}
