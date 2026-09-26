"use client"

import { FormOptionalLabelProvider } from "@chatbotx.io/ui/components/form/optional-label-context"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"

/**
 * Feeds the translated optional-field marker (`fields.optionalHint`) to the
 * shared form fields of packages/ui, which render it through
 * `FormFieldWrapper` and have no i18n of their own.
 */
export function FormOptionalLabelBridge({ children }: { children: ReactNode }) {
  const t = useTranslations("fields")

  return (
    <FormOptionalLabelProvider value={t("optionalHint")}>
      {children}
    </FormOptionalLabelProvider>
  )
}
