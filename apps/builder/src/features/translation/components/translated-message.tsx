"use client"

import { type ReactNode, useMemo } from "react"
import type { MessageItemTranslation } from "@/features/messages/components/message-item"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"
import { useConversationTranslation } from "../hooks/use-conversation-translation"
import { useRetryTranslation } from "../hooks/use-retry-translation"
import { resolveMessageTranslationView } from "../lib/message-translation-view"
import { useTranslationUiStore } from "../store/translation-ui-store"
import { MessageTranslation } from "./message-translation"

/**
 * Computes what a message's bubble shows for translation and hands it to the
 * bubble through `children`. With translation off for the workspace or the
 * conversation the view is `none`, `children(undefined)` is called, and the
 * bubble renders exactly as it did before the feature.
 */
export function TranslatedMessage(props: {
  message: MessageResourceWithRelations
  children: (translation: MessageItemTranslation | undefined) => ReactNode
}) {
  const { message, children } = props
  const { effective, workspaceLanguage } = useConversationTranslation()
  const requestState = useTranslationUiStore(
    (state) => state.entries[message.id]?.state,
  )
  const retry = useRetryTranslation(message.conversationId)
  // Collapsed unless the agent opened this message, or the conversation shows
  // every original ("Show original text" in its menu).
  const showAll = useTranslationUiStore(
    (state) => state.showAllOriginals[message.conversationId] ?? false,
  )
  const override = useTranslationUiStore(
    (state) => state.originalOverrides[message.conversationId]?.[message.id],
  )
  const setOriginalOpen = useTranslationUiStore(
    (state) => state.setOriginalOpen,
  )
  const expanded = override ?? showAll

  const view = useMemo(
    () =>
      resolveMessageTranslationView({
        message,
        enabled: effective,
        workspaceLanguage,
        requestState,
      }),
    [effective, message, requestState, workspaceLanguage],
  )

  if (view.kind === "none") {
    return children(undefined)
  }
  const request = (retryFailed: boolean) =>
    retry(
      { id: message.id, createdAt: new Date(message.createdAt) },
      retryFailed,
    )
  return children({
    mainText: view.kind === "translated" ? view.mainText : undefined,
    footer: (
      <MessageTranslation
        expanded={expanded}
        onRequestAgain={() => request(false)}
        onRetry={() => request(true)}
        onToggle={() =>
          setOriginalOpen(message.conversationId, message.id, !expanded)
        }
        view={view}
      />
    ),
  })
}
