"use client"

import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
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
  return (
    <SelectField
      label={label}
      name={name}
      options={languageOptions}
      placeholder="Please select"
      required={required}
    />
  )
}
