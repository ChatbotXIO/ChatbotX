"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { languageOptions } from "../type"

export function WhatsappMessageTemplateLanguageSelect({
  name,
  label,
  required = false,
}: {
  name: string
  label: string
  required?: boolean
}) {
  const t = useTranslations()

  return (
    <SelectField
      label={label}
      name={name}
      options={languageOptions}
      placeholder={t("actions.pleaseSelect")}
      required={required}
    />
  )
}
