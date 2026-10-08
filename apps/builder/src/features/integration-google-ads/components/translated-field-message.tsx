"use client"

import { useFormField } from "@chatbotx.io/ui/components/ui/form"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"

type TranslatedFieldMessageProps = {
  className?: string
  /** Keep a pending error out of sight (see `deferError` on the template field). */
  hidden?: boolean
}

/**
 * `FormMessage` for a field whose validation message is an i18n key (the
 * Google Ads schemas emit keys, not English). Rendered as `role="alert"` so
 * the error is announced; the id matches what `FormControl` / the template
 * field reference from `aria-describedby`. A message that is not a known key
 * is shown as-is.
 */
export const TranslatedFieldMessage = ({
  className,
  hidden = false,
}: TranslatedFieldMessageProps) => {
  const t = useTranslations()
  const { error, formMessageId } = useFormField()
  const message = error?.message ? String(error.message) : ""

  if (!message || hidden) {
    return null
  }

  return (
    <p
      className={cn("text-destructive text-sm", className)}
      data-slot="form-message"
      id={formMessageId}
      role="alert"
    >
      {t.has(message) ? t(message) : message}
    </p>
  )
}
