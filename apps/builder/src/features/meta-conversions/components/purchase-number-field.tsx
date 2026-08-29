"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Input } from "@chatbotx.io/ui/components/ui/input"

type PurchaseNumberFieldProps = {
  name: string
  label?: string
  placeholder?: string
  min?: number
  step?: string
}

/**
 * Numeric `contents[].quantity`/`contents[].itemPrice` field (plan #4) — the
 * shared `InputField` stores whatever string the user typed, but the
 * `contents[]` zod shape (`metaCapiPurchaseContentItemSchema`) requires real
 * `number`s, so this parses on change instead of leaving that to zod
 * coercion at submit time.
 */
export const PurchaseNumberField = ({
  name,
  label,
  placeholder,
  min,
  step,
}: PurchaseNumberFieldProps) => (
  <FormFieldWrapper label={label} name={name}>
    {(field) => (
      <Input
        inputMode="decimal"
        min={min}
        onChange={(event) => {
          const raw = event.target.value
          field.onChange(raw === "" ? undefined : Number(raw))
        }}
        placeholder={placeholder}
        step={step}
        type="number"
        value={field.value ?? ""}
      />
    )}
  </FormFieldWrapper>
)
