"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { useTranslations } from "next-intl"

type AIAgentSelectProps = {
  name: string
  required?: boolean
}

export function AIAgentSelect(props: AIAgentSelectProps) {
  const t = useTranslations()

  const frameworksList = [
    { value: "react", label: t("fields.framework.react") },
    { value: "angular", label: t("fields.framework.angular") },
    { value: "vue", label: t("fields.framework.vue") },
    { value: "svelte", label: t("fields.framework.svelte") },
    { value: "ember", label: t("fields.framework.ember") },
  ]

  return (
    <SelectField
      label={t("fields.aiAgent.label")}
      options={frameworksList}
      {...props}
    />
  )
}
