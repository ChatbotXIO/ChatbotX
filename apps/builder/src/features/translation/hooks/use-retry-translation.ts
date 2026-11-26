"use client"

import { useCallback } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { requestTranslationsAction } from "../actions/request-messages.action"
import { WAITING_AFTER_MS } from "../lib/request-batches"
import { useTranslationUiStore } from "../store/translation-ui-store"

/**
 * The two manual re-requests of one message. "Retry" (`retryFailed`) is for a
 * row that `failed`; "request again" is for one that never answered, and the
 * server answers `inFlight` while the first request is still being worked on,
 * in which case the bubble keeps waiting.
 */
export function useRetryTranslation(conversationId: string) {
  const workspaceId = useWorkspaceId()
  const markRequested = useTranslationUiStore((state) => state.markRequested)
  const markWaiting = useTranslationUiStore((state) => state.markWaiting)
  const clear = useTranslationUiStore((state) => state.clear)

  return useCallback(
    async (message: { id: string; createdAt: Date }, retryFailed: boolean) => {
      const ids = [message.id]
      markRequested(ids)
      try {
        const result = await requestTranslationsAction(
          workspaceId,
          conversationId,
          {
            messages: [
              { id: message.id, createdAt: new Date(message.createdAt) },
            ],
            retryFailed,
          },
        )
        const data = result?.data
        const stillWaiting =
          data &&
          (data.accepted.includes(message.id) ||
            data.skipped.some(
              (skip) => skip.id === message.id && skip.reason === "inFlight",
            ))
        if (stillWaiting) {
          setTimeout(() => markWaiting(ids), WAITING_AFTER_MS)
          return
        }
        clear(ids)
      } catch {
        clear(ids)
      }
    },
    [clear, conversationId, markRequested, markWaiting, workspaceId],
  )
}
