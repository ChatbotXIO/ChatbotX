"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { getProperty } from "dot-prop"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { useFormState } from "react-hook-form"
import { resolveFlowValidationCodeKey } from "../../flow-validation-message"
import type { QuickReplySettingsSectionName } from "./edge"

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <div className="h-px flex-1 bg-border" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

/**
 * A section's on/off switch. `onToggle` runs before the form value changes,
 * so a field it fills is already set when the section's fields mount. The
 * error under it is left to `SectionErrors`, which translates it.
 */
export function SectionSwitch({
  sectionName,
  label,
  description,
  disabled,
  onToggle,
}: {
  sectionName: QuickReplySettingsSectionName
  label: string
  description?: string
  disabled?: boolean
  onToggle?: (checked: boolean) => void
}) {
  return (
    <FormFieldWrapper
      description={description}
      descriptionType="tooltip"
      formItemClassName="flex items-center justify-between gap-2"
      hideMessage
      label={label}
      name={`${sectionName}.enabled`}
      required
    >
      {(field) => (
        <Switch
          checked={Boolean(field.value)}
          disabled={disabled}
          onBlur={field.onBlur}
          onCheckedChange={(checked) => {
            onToggle?.(checked)
            field.onChange(checked)
          }}
        />
      )}
    </FormFieldWrapper>
  )
}

type SectionErrorField = "enabled" | "target" | "message"

/**
 * The section's rule errors, translated: a validation code maps to
 * `messages.<code>`, anything else is shown as it is.
 */
export function SectionErrors({
  sectionName,
  fields,
}: {
  sectionName: QuickReplySettingsSectionName
  fields: readonly SectionErrorField[]
}) {
  const t = useTranslations()
  const { errors } = useFormState({ name: sectionName })
  const sectionErrors = getProperty(errors, sectionName) as
    | Partial<Record<SectionErrorField, { message?: unknown }>>
    | undefined

  const messages = fields.flatMap((field) => {
    const message = sectionErrors?.[field]?.message
    return typeof message === "string" && message.length > 0
      ? [{ field, message }]
      : []
  })
  if (messages.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-1">
      {messages.map(({ field, message }) => {
        const key = resolveFlowValidationCodeKey(message)
        return (
          <p className="text-destructive text-sm" key={field}>
            {key ? t(key) : message}
          </p>
        )
      })}
    </div>
  )
}
