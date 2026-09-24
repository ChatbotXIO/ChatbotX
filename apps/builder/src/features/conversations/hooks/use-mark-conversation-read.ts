"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { readConversationAction } from "../actions/read-conversation.action"

export type MarkReadTarget = { id: string; workspaceId: string }

// Module-wide so every hook instance (active row, thread pane) shares it:
// click, scroll and leave can all fire for the same conversation within one
// tick, and one request in flight per conversation is enough.
const inFlightByConversationId = new Map<string, Promise<void>>()

/**
 * Marks a conversation read on the server and mirrors the persisted read
 * timestamp into the chat store. Takes the target per call (not bound at hook
 * time) so the same instance can clear the conversation the agent is leaving
 * as well as the one they are interacting with.
 */
export function useMarkConversationRead() {
  const applyAgentLastReadAt = useChatStore(
    (state) => state.applyAgentLastReadAt,
  )

  return useCallback(
    (target: MarkReadTarget): Promise<void> => {
      const inFlight = inFlightByConversationId.get(target.id)
      if (inFlight) {
        return inFlight
      }

      const request = readConversationAction(target.workspaceId, target.id)
        .then((result) => {
          if (result?.serverError) {
            toast.error(result.serverError)
            return
          }
          if (result?.data) {
            applyAgentLastReadAt(
              [target.id],
              new Date(result.data.agentLastReadAt),
            )
          }
        })
        .catch(() => {
          // Transport failure: same as `useAction`'s fetchError, which the
          // inbox never surfaces — the row simply stays unread.
        })
        .finally(() => {
          inFlightByConversationId.delete(target.id)
        })

      inFlightByConversationId.set(target.id, request)
      return request
    },
    [applyAgentLastReadAt],
  )
}
