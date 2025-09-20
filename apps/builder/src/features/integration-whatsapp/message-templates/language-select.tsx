"use client"

import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { LanguageOptions } from "@/features/integration-whatsapp/message-templates/type"

export function WhatsappMessageTemplateLanguageSelect({
  name,
  label,
  isRequired = false,
}: {
  name: string
  label: string
  isRequired?: boolean
}) {
  return (
    <SelectField
      label={label}
      name={name}
      options={LanguageOptions}
      placeholder="Please select"
      required={isRequired}
    />
  )
}
