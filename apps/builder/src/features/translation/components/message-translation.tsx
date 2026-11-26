"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronDownIcon, LanguagesIcon, Loader2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { languageLabel } from "../lib/language-label"
import type { MessageTranslationView } from "../lib/message-translation-view"

type MessageTranslationProps = {
  view: Exclude<MessageTranslationView, { kind: "none" }>
  /** "Retry" on a failed translation. */
  onRetry: () => void
  /** "Request again" on one that never answered. */
  onRequestAgain: () => void
  /** A translated message shows its original only while this is true. */
  expanded: boolean
  /** Opens or closes the original of a translated message. */
  onToggle: () => void
}

/**
 * The line under a bubble's main text. A translated message gets a small muted
 * "Translated from Vietnamese ⌄" row that opens the original (or, on an agent's
 * own message, what the customer received); otherwise it is the state of the
 * request. A neutral
 * "still waiting" is never an error; only a stored failure offers "Retry".
 */
export function MessageTranslation({
  view,
  onRetry,
  onRequestAgain,
  expanded,
  onToggle,
}: MessageTranslationProps) {
  const t = useTranslations("inboxTranslation.message")
  const tActions = useTranslations("actions")
  const locale = useLocale()

  if (view.kind === "translated") {
    const language = view.languageCode
      ? languageLabel(view.languageCode, locale)
      : null
    const isInbound = view.direction === "inbound"

    let actionLabel: string
    if (isInbound) {
      actionLabel = expanded
        ? t("hideOriginal")
        : t(language ? "translatedFrom" : "translatedFromNoLanguage", {
            language: language ?? "",
          })
    } else {
      actionLabel = expanded
        ? t("hideSent")
        : t(language ? "sentIn" : "sentInNoLanguage", {
            language: language ?? "",
          })
    }
    // Just the language: the icon and the arrow say the rest, the tooltip spells it out.
    const rowLabel =
      language ??
      (isInbound ? t("translatedLabelNoLanguage") : t("sentLabelNoLanguage"))
    return (
      <>
        <button
          aria-expanded={expanded}
          className="mt-1 flex items-center gap-1 rounded text-[11px] opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-current/40"
          onClick={onToggle}
          title={actionLabel}
          type="button"
        >
          <LanguagesIcon aria-hidden className="size-3" />
          <span>{rowLabel}</span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-3 transition-transform duration-300",
              expanded && "rotate-180",
            )}
          />
        </button>
        {/* Always mounted so the height can animate (0fr -> 1fr); hidden from
            assistive tech and the tab order while collapsed. */}
        <div
          aria-hidden={!expanded}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none",
            expanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
          data-slot="translation-original"
          inert={!expanded}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-1 border-current/20 border-t pt-1 text-xs opacity-80">
              <pre
                className="wrap-break-word whitespace-pre-line font-sans"
                dir="auto"
              >
                {view.secondaryText}
              </pre>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (view.kind === "pending") {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs opacity-70">
        <Loader2Icon aria-hidden className="size-3 animate-spin" />
        {t("translating")}
      </p>
    )
  }

  const isFailed = view.kind === "failed"
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs opacity-80">
      <span>{isFailed ? t("failed") : t("stillWaiting")}</span>
      <Button
        className="h-5 px-1 text-xs"
        onClick={isFailed ? onRetry : onRequestAgain}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isFailed ? tActions("retry") : t("requestAgain")}
      </Button>
    </p>
  )
}
