"use client"

import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { useTranslations } from "next-intl"

type AITriggerSelectProps = {
  name: string
  required?: boolean
}

export function AITriggerMultiSelect(props: AITriggerSelectProps) {
  const t = useTranslations()

  const frameworksList = [
    { value: "react", label: t("fields.framework.react") },
    { value: "angular", label: t("fields.framework.angular") },
    { value: "vue", label: t("fields.framework.vue") },
    { value: "svelte", label: t("fields.framework.svelte") },
    { value: "ember", label: t("fields.framework.ember") },
  ]

  return (
    <MultiSelectField
      label={t("fields.aiTrigger.label")}
      options={frameworksList}
      {...props}
    />
  )
}
