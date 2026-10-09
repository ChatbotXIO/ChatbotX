"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { readConversationAction } from "../actions/read-conversation.action"
import {
  getPendingUnread,
  type InFlightRead,
  inFlightReadByConversationId,
} from "../lib/pending-reads"
import type { ListConversationItemResource } from "../schema/resource"

export type MarkReadTarget = Pick<
  ListConversationItemResource,
  "id" | "workspaceId" | "lastActivityAt"
>

type ApplyAgentLastReadAt = (
  conversationIds: string[],
  agentLastReadAt: Date,
) => void

const activityTimeOf = (target: MarkReadTarget): number | null =>
  target.lastActivityAt === null
    ? null
    : new Date(target.lastActivityAt).getTime()

// The server stamps the read at request time, so a message that landed after
// the in-flight request started is newer than what that request will persist.
const hasNewerActivity = (
  inFlight: InFlightRead,
  target: MarkReadTarget,
): boolean => {
  const activityAt = activityTimeOf(target)
  return (
    activityAt !== null &&
    (inFlight.activityAt === null || activityAt > inFlight.activityAt)
  )
}

const requestRead = (
  target: MarkReadTarget,
  applyAgentLastReadAt: ApplyAgentLastReadAt,
  pendingUnread: Promise<void> | undefined,
): Promise<void> => {
  const read = () => readConversationAction(target.workspaceId, target.id)
  // A "mark unread" write still in flight goes first; otherwise this read
  // could commit before it and the reopened thread would end up unread.
  // Issued synchronously when nothing is pending.
  return (pendingUnread ? pendingUnread.then(read) : read())
    .then((result) => {
      if (result?.serverError) {
        toast.error(result.serverError)
        return
      }
      if (result?.data) {
        applyAgentLastReadAt([target.id], new Date(result.data.agentLastReadAt))
      }
    })
    .catch(() => {
      // Transport failure: same as `useAction`'s fetchError, which the
      // inbox never surfaces — the row simply stays unread.
    })
}

/**
 * Marks a conversation read on the server and mirrors the persisted read
 * timestamp into the chat store. Takes the target per call (not bound at hook
 * time) so the same instance can clear the conversation the agent is leaving
 * as well as the one they are interacting with.
 *
 * Calls for the same conversation share the in-flight request, except when
 * the caller's snapshot carries activity newer than that request was issued
 * for: then exactly one trailing read is queued behind it.
 */
export function useMarkConversationRead() {
  const applyAgentLastReadAt = useChatStore(
    (state) => state.applyAgentLastReadAt,
  )

  return useCallback(
    (target: MarkReadTarget): Promise<void> => {
      const inFlight = inFlightReadByConversationId.get(target.id)
      const pendingUnread = getPendingUnread(target.id)
      if (
        inFlight &&
        inFlight.behindUnread === pendingUnread &&
        !hasNewerActivity(inFlight, target)
      ) {
        return inFlight.request
      }

      const read = () =>
        requestRead(target, applyAgentLastReadAt, pendingUnread)
      const request: Promise<void> = (
        inFlight ? inFlight.request.then(read) : read()
      ).finally(() => {
        if (inFlightReadByConversationId.get(target.id)?.request === request) {
          inFlightReadByConversationId.delete(target.id)
        }
      })

      inFlightReadByConversationId.set(target.id, {
        request,
        activityAt: activityTimeOf(target),
        behindUnread: pendingUnread,
      })
      return request
    },
    [applyAgentLastReadAt],
  )
}
