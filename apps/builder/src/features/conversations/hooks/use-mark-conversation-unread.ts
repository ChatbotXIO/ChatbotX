"use client"

import { useAction } from "next-safe-action/hooks"
import { useCallback } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { useWorkspaceId } from "@/hooks/routing"
import { unreadConversationAction } from "../actions/unread-conversation.action"
import { registerPendingUnread, waitForPendingRead } from "../lib/pending-reads"
import { useConversationIdParam } from "./use-conversation-id-param"

/**
 * "Mark as Unread" for one conversation.
 *
 * The conversation is pinned as manually-unread before the write so the
 * automatic read paths (thread interaction, leaving the thread) stand down at
 * once. The write waits for a read already in flight, so it cannot be undone
 * by a read landing after it, and is registered *before* that wait so a read
 * issued meanwhile (a deliberate reopen) queues behind the write instead of
 * reusing the older in-flight read.
 *
 * Marking the *open* conversation unread also closes it (like Chatwoot): an
 * open thread is by definition read, so leaving it on screen as a bold row
 * would only invite the next interaction to read it straight back. The write
 * is registered before the close so the thread's leave path, which runs in
 * the same commit as the pin and cannot see it yet, stands down.
 *
 * The outcome is handled in the promise chain, not in `useAction` callbacks:
 * those run from the menu's React effects, and the row that owns the menu is
 * virtualized — scrolled out of view before the server answers, the mirror
 * of the server cursor (or the rollback of the pin on failure) would be lost
 * with it.
 */
export function useMarkConversationUnread(conversationId: string) {
  const workspaceId = useWorkspaceId()
  const conversationIdParam = useConversationIdParam()
  const activeConversationId = useChatStore(
    (state) => state.activeConversationId,
  )
  const setActiveConversationId = useChatStore(
    (state) => state.setActiveConversationId,
  )
  const markManuallyUnread = useChatStore((state) => state.markManuallyUnread)
  const clearManuallyUnread = useChatStore((state) => state.clearManuallyUnread)
  const applyUnreadResult = useChatStore((state) => state.applyUnreadResult)

  const { executeAsync, isExecuting } = useAction(
    unreadConversationAction.bind(null, workspaceId, conversationId),
  )

  const markAsUnread = useCallback((): Promise<void> => {
    markManuallyUnread(conversationId)
    const write = waitForPendingRead(conversationId)
      .then(() => executeAsync())
      .then(
        (result) => {
          if (result?.data) {
            // null is a real value here (single-message conversation → never
            // read); turning it into "now" would show the row as read locally.
            const { agentLastReadAt } = result.data
            applyUnreadResult(
              conversationId,
              agentLastReadAt ? new Date(agentLastReadAt) : null,
            )
            return
          }
          clearManuallyUnread(conversationId)
          if (result?.serverError) {
            toast.error(result.serverError)
          }
        },
        () => {
          // Transport failure: same as `useAction`'s fetchError, which the
          // inbox never surfaces — the row simply stays as it was.
          clearManuallyUnread(conversationId)
        },
      )
    registerPendingUnread(conversationId, write)
    if (activeConversationId === conversationId) {
      conversationIdParam.clear()
      setActiveConversationId(null)
    }
    return write
  }, [
    activeConversationId,
    applyUnreadResult,
    clearManuallyUnread,
    conversationId,
    conversationIdParam,
    executeAsync,
    markManuallyUnread,
    setActiveConversationId,
  ])

  return { markAsUnread, isMarkingUnread: isExecuting }
}
