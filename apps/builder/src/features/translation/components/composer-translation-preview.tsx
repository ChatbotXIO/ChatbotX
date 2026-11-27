"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LanguagesIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import type { TranslationPreview } from "../hooks/use-translation-preview"
import { languageLabel } from "../lib/language-label"

/**
 * What the customer will receive, between the text box and the toolbar. Read
 * only at first; "Edit" turns the text into a box so an agent can fix a
 * translation before it goes out (Enter sends the panel's text, see the
 * composer). Rendered only while translation is active for the conversation and
 * previews are on, so with translation off the composer is unchanged.
 */
export function ComposerTranslationPreview(props: {
  preview: TranslationPreview
  language: string
  onEdit: (translated: string) => void
  onTranslate: () => void
}) {
  const { preview, language, onEdit, onTranslate } = props
  const t = useTranslations("inboxTranslation.composer.preview")
  const tActions = useTranslations("actions")
  const locale = useLocale()
  const [editing, setEditing] = useState(false)

  // A new translation replaces what was being edited.
  const isLoading = preview.status === "loading"
  useEffect(() => {
    if (isLoading) {
      setEditing(false)
    }
  }, [isLoading])

  if (preview.status === "idle") {
    return null
  }

  const title = t("title", { language: languageLabel(language, locale) })
  const isStale = preview.status === "stale"
  const isFailed = preview.status === "failed"
  const translated =
    preview.status === "ready" || preview.status === "stale"
      ? preview.translated
      : null
  const hasText = translated !== null

  return (
    <div className="mx-2.5 mb-1 space-y-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 font-semibold text-xs">
          <LanguagesIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </p>
        <StatusIcon
          labels={{
            ready: t("ready"),
            stale: t("needsRetranslate"),
            failed: t("failed"),
            loading: t("translating"),
          }}
          status={preview.status}
        />
      </div>

      {isLoading && (
        <p className="text-muted-foreground text-xs">{t("translating")}</p>
      )}
      {isFailed && (
        <p className="text-muted-foreground text-xs">{t("failed")}</p>
      )}
      {isStale && (
        <p className="text-muted-foreground text-xs">{t("needsRetranslate")}</p>
      )}

      {hasText &&
        (editing ? (
          <Textarea
            aria-label={title}
            autoFocus
            className="min-h-14 resize-none px-2 py-1 shadow-none"
            dir="auto"
            onChange={(event) => onEdit(event.target.value)}
            value={translated}
          />
        ) : (
          <p className="wrap-break-word whitespace-pre-line" dir="auto">
            {translated}
          </p>
        ))}

      {(hasText || isFailed) && (
        <div className="flex items-center justify-end gap-1">
          {hasText && (
            <Button
              className="h-7 gap-1 px-2 text-muted-foreground text-xs"
              onClick={() => setEditing((current) => !current)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <PencilIcon aria-hidden className="size-3.5" />
              {editing ? t("done") : tActions("edit")}
            </Button>
          )}
          <Button
            className="h-7 gap-1 px-2 text-muted-foreground text-xs"
            onClick={onTranslate}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RefreshCwIcon aria-hidden className="size-3.5" />
            {t("retranslate")}
          </Button>
        </div>
      )}
    </div>
  )
}

function StatusIcon(props: {
  status: Exclude<TranslationPreview["status"], "idle">
  labels: Record<"ready" | "stale" | "failed" | "loading", string>
}) {
  const { status, labels } = props
  switch (status) {
    case "ready":
      return (
        <CheckCircle2Icon
          aria-label={labels.ready}
          className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
          role="img"
        />
      )
    case "loading":
      return (
        <Loader2Icon
          aria-label={labels.loading}
          className="size-4 shrink-0 animate-spin text-muted-foreground"
          role="img"
        />
      )
    case "stale":
      return (
        <AlertCircleIcon
          aria-label={labels.stale}
          className="size-4 shrink-0 text-amber-700 dark:text-amber-400"
          role="img"
        />
      )
    default:
      return (
        <AlertCircleIcon
          aria-label={labels.failed}
          className="size-4 shrink-0 text-destructive"
          role="img"
        />
      )
  }
}
