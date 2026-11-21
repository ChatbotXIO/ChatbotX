"use client"

import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  type OutgoingTranslationStatus as Status,
  useTranslationUiStore,
} from "../store/translation-ui-store"

/** Where an agent's translated message stands in this tab, by its `clientId`. */
export function useOutgoingTranslationStatus(
  clientId: string | null | undefined,
): Status | null {
  return useTranslationUiStore((state) =>
    clientId ? (state.outgoing[clientId] ?? null) : null,
  )
}

/**
 * The line under an agent's message sent with translation: "Translating…"
 * while the server waits for the translation, "Translation failed" when it was
 * not sent. The failed one stays until the page reloads; the agent sends the
 * text again as a new message.
 */
export function OutgoingTranslationStatus(props: { status: Status }) {
  const t = useTranslations("inboxTranslation.send")
  if (props.status === "translating") {
    return (
      <span
        className="flex items-center gap-1 self-end px-1 text-muted-foreground text-xs"
        role="status"
      >
        <Loader2Icon aria-hidden className="size-3 animate-spin" />
        {t("translating")}
      </span>
    )
  }
  return (
    <span
      className="flex items-center gap-1 self-end px-1 text-destructive text-xs"
      role="alert"
    >
      <AlertCircleIcon aria-hidden className="size-3" />
      {t("failed")}
    </span>
  )
}
