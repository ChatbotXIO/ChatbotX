"use client"

import { SelectField } from "@/components/form/select-field"
import { LanguageOptions } from "@/features/integration-whatsapp/message-templates/type"

export function LanguageSelect({
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
      name={name}
      label={label}
      isRequired={isRequired}
      placeholder="Please select"
      options={LanguageOptions}
    />
  )
}
