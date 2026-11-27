"use client"

import { useEffect, useMemo, useRef } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { useWorkspaceId } from "@/hooks/routing"
import { requestTranslationsAction } from "../actions/request-messages.action"
import { needsTranslationRequest } from "../lib/message-translation-view"
import {
  planRequests,
  REQUEST_GATHER_DELAY_MS,
  type RequestCandidate,
  requestSignature,
  WAITING_AFTER_MS,
} from "../lib/request-batches"
import { useTranslationUiStore } from "../store/translation-ui-store"
import { useConversationTranslation } from "./use-conversation-translation"
import { usePageVisible } from "./use-page-visible"

/**
 * Asks for inbound messages to be translated while the conversation is open and
 * the tab is visible. Nothing is translated in the background: an unopened
 * conversation costs no model call, and a hidden tab asks for nothing.
 *
 * It does nothing at all when translation is off for the workspace or the
 * conversation, so the Inbox keeps its previous behavior and request list.
 */
export function useRequestTranslations(): void {
  const workspaceId = useWorkspaceId()
  const visible = usePageVisible()
  const { effective, workspaceLanguage } = useConversationTranslation()
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  )
  const messages = useChatStore((state) => state.messages)
  const markRequested = useTranslationUiStore((state) => state.markRequested)
  const markWaiting = useTranslationUiStore((state) => state.markWaiting)
  const clear = useTranslationUiStore((state) => state.clear)

  // id -> signature of the request already made. Not state: it never renders.
  const asked = useRef(new Map<string, string>())
  const askedConversation = useRef<string | null>(null)

  const candidates = useMemo<RequestCandidate[]>(() => {
    if (!(effective && visible && activeConversationId)) {
      return []
    }
    return messages.flatMap((message) =>
      message.conversationId === activeConversationId &&
      needsTranslationRequest({ message, workspaceLanguage })
        ? [
            {
              id: message.id,
              createdAt: new Date(message.createdAt),
              signature: requestSignature(message.text, workspaceLanguage),
            },
          ]
        : [],
    )
  }, [activeConversationId, effective, messages, visible, workspaceLanguage])

  useEffect(() => {
    if (!activeConversationId || candidates.length === 0) {
      return
    }
    const batches = planRequests({ candidates, asked: asked.current })
    if (batches.length === 0) {
      return
    }
    // The first look at a conversation is requested at once; messages that
    // arrive while it is open are gathered so a burst is a single request.
    const isFirstLook = askedConversation.current !== activeConversationId
    const timer = setTimeout(
      () => {
        askedConversation.current = activeConversationId
        for (const batch of batches) {
          const signatures = new Map(
            batch.map((candidate) => [candidate.id, candidate.signature]),
          )
          for (const candidate of batch) {
            asked.current.set(candidate.id, candidate.signature)
          }
          requestBatch({
            workspaceId,
            conversationId: activeConversationId,
            batch,
            markRequested,
            markWaiting,
            clear,
            // Nothing will arrive for these: ask again on the next change to
            // the conversation (new message, reopen) instead of never.
            forget: (ids) => {
              for (const id of ids) {
                if (asked.current.get(id) === signatures.get(id)) {
                  asked.current.delete(id)
                }
              }
            },
          })
        }
      },
      isFirstLook ? 0 : REQUEST_GATHER_DELAY_MS,
    )
    return () => clearTimeout(timer)
  }, [
    activeConversationId,
    candidates,
    clear,
    markRequested,
    markWaiting,
    workspaceId,
  ])
}

async function requestBatch(props: {
  workspaceId: string
  conversationId: string
  batch: RequestCandidate[]
  markRequested: (ids: string[]) => void
  markWaiting: (ids: string[]) => void
  clear: (ids: string[]) => void
  /** Lets the hook ask for these again later: the request did not go through. */
  forget: (ids: string[]) => void
}): Promise<void> {
  const { batch, markRequested, markWaiting, clear, forget } = props
  // Show "translating" right away for everything asked for; the answer says
  // which of them will not be (noise, off, unavailable) and those stop at once.
  const ids = batch.map((candidate) => candidate.id)
  markRequested(ids)
  try {
    const result = await requestTranslationsAction(
      props.workspaceId,
      props.conversationId,
      {
        messages: batch.map(({ id, createdAt }) => ({ id, createdAt })),
        retryFailed: false,
      },
    )
    const data = result?.data
    if (!data) {
      clear(ids)
      forget(ids)
      return
    }
    // Only an `inFlight` skip still has a result on its way (another tab or
    // agent queued it); every other skip means there is nothing to wait for.
    const stillWaiting = new Set([
      ...data.accepted,
      ...data.skipped
        .filter((skip) => skip.reason === "inFlight")
        .map((skip) => skip.id),
    ])
    clear(ids.filter((id) => !stillWaiting.has(id)))
    // Translation was off or the integration unusable right now: once that is
    // fixed, the next change to the conversation asks for these again.
    forget(
      data.skipped
        .filter(
          (skip) => skip.reason === "unavailable" || skip.reason === "disabled",
        )
        .map((skip) => skip.id),
    )
    if (stillWaiting.size > 0) {
      setTimeout(() => markWaiting([...stillWaiting]), WAITING_AFTER_MS)
    }
  } catch {
    clear(ids)
    forget(ids)
  }
}
