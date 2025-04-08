"use client"

import { LanguageOptions } from "@/features/integration-whatsapp/message-templates/type"
import { SingleSelect } from "@/components/single-select"
import { FormInput } from "@/components/form-input"

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
    <FormInput name={name} label={label} isRequired={isRequired}>
      <SingleSelect
        name={name}
        placeholder="Please select"
        options={LanguageOptions}
      />
    </FormInput>
  )
}
