"use client"

import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { resolveFlowValidationCodeKey } from "./flow-validation-message"

/**
 * The rich-text field would print a validation code raw, since it is the rule's
 * own message; a code is shown as its translated text and a plain schema
 * message as it is.
 */
export const FlowValidationFieldError = ({ name }: { name: string }) => {
  const t = useTranslations()
  const { formState, getFieldState } = useFormContext()
  const message = getFieldState(name, formState).error?.message

  if (!message) {
    return null
  }

  const key = resolveFlowValidationCodeKey(message)

  return (
    <p className="text-destructive text-sm" role="alert">
      {key ? t(key) : message}
    </p>
  )
}
