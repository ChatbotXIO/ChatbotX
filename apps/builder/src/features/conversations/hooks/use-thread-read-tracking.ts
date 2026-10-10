"use client"

import { useEffect, useRef } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { isConversationUnread } from "../lib/is-conversation-unread"
import { getPendingUnread } from "../lib/pending-reads"
import {
  type MarkReadTarget,
  useMarkConversationRead,
} from "./use-mark-conversation-read"

type TrackedConversation = MarkReadTarget &
  Parameters<typeof isConversationUnread>[0]

// A "mark unread" write still in flight counts as unread: the local cursor
// only catches up when the server answers, and a deliberate reopen in that
// window must still issue the read that lands after the write.
const shouldRead = (
  conversation: TrackedConversation,
  manuallyUnreadIds: ReadonlySet<string>,
) =>
  (isConversationUnread(conversation) ||
    getPendingUnread(conversation.id) !== undefined) &&
  !manuallyUnreadIds.has(conversation.id)

// Leaving is the opposite case. A pending write means the agent just marked
// this conversation unread — on the open thread the pin and the close land in
// the same commit, so the pin is not visible to the leave cleanup yet — and
// any deliberate reopen has already queued its own read behind that write.
const shouldReadOnLeave = (
  conversation: TrackedConversation,
  manuallyUnreadIds: ReadonlySet<string>,
) =>
  isConversationUnread(conversation) &&
  getPendingUnread(conversation.id) === undefined &&
  !manuallyUnreadIds.has(conversation.id)

/**
 * When the open thread counts as read:
 *  - opening it (selecting a row, a deep link, call navigation) reads it
 *    right away — done here rather than in the row, because on mobile the
 *    list unmounts the moment a row is selected;
 *  - a customer message that lands while the thread is open is left unread
 *    on purpose (the agent may not be looking); it is cleared by any
 *    deliberate interaction with the thread: click, pointer down (also on
 *    the scrollbar), keyboard focus, wheel or touch scrolling. Pointer
 *    movement alone never counts, and neither does the `scroll` event: the
 *    message list follows new output, so that scroll is often the list's
 *    own reaction to the very message that should stay unread, and
 *  - leaving it: switching conversation, going back to the list, unmount.
 *
 * Neither applies to a conversation the agent explicitly marked unread
 * (`manuallyUnreadConversationIds`): that mark holds until they select the
 * conversation again. "Mark as Unread" on the open thread also closes it,
 * and that leave must not read it straight back — see `shouldReadOnLeave`.
 *
 * Returns the capture-phase handlers to spread on the thread's root element.
 */
export function useThreadReadTracking(
  activeConversation: TrackedConversation | null,
) {
  const markConversationRead = useMarkConversationRead()
  const manuallyUnreadConversationIds = useChatStore(
    (state) => state.manuallyUnreadConversationIds,
  )
  const openRequestNonce = useChatStore((state) => state.openRequestNonce)

  const onInteraction = () => {
    if (
      activeConversation &&
      shouldRead(activeConversation, manuallyUnreadConversationIds)
    ) {
      markConversationRead(activeConversation)
    }
  }

  // Latest snapshot of the open conversation, refreshed after every commit so
  // a message that arrived while it was open is reflected. On the commit that
  // switches conversations React runs the leave cleanup below before this
  // effect, so the ref still holds the conversation being left.
  const activeConversationId = activeConversation?.id ?? null
  const latestActiveConversationRef = useRef(activeConversation)
  const latestManuallyUnreadIdsRef = useRef(manuallyUnreadConversationIds)
  useEffect(() => {
    latestActiveConversationRef.current = activeConversation
    latestManuallyUnreadIdsRef.current = manuallyUnreadConversationIds
  })
  useEffect(
    () => () => {
      const leaving = latestActiveConversationRef.current
      if (
        leaving?.id === activeConversationId &&
        shouldReadOnLeave(leaving, latestManuallyUnreadIdsRef.current)
      ) {
        markConversationRead(leaving)
      }
    },
    [activeConversationId, markConversationRead],
  )

  // Opening: keyed on the id (plus the store's explicit open requests for
  // the already-active thread) so a message arriving later — same id, new
  // snapshot — does not re-trigger it; that case waits for an interaction.
  // biome-ignore lint/correctness/useExhaustiveDependencies: openRequestNonce is a trigger, not a value; the refs hold the latest snapshot
  useEffect(() => {
    const opened = latestActiveConversationRef.current
    if (
      opened?.id === activeConversationId &&
      shouldRead(opened, latestManuallyUnreadIdsRef.current)
    ) {
      markConversationRead(opened)
    }
  }, [activeConversationId, openRequestNonce, markConversationRead])

  return {
    onClickCapture: onInteraction,
    onFocusCapture: onInteraction,
    onPointerDownCapture: onInteraction,
    onTouchMoveCapture: onInteraction,
    onWheelCapture: onInteraction,
  }
}
