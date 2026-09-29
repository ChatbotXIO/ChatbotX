"use client"

import { useEffect, useRef } from "react"
import { isConversationUnread } from "../lib/is-conversation-unread"
import {
  type MarkReadTarget,
  useMarkConversationRead,
} from "./use-mark-conversation-read"

type TrackedConversation = MarkReadTarget &
  Parameters<typeof isConversationUnread>[0]

/**
 * When the open thread counts as read. A customer message that lands while
 * the thread is open is left unread on purpose (the agent may not be looking);
 * it is cleared by
 *  - any deliberate interaction with the thread: click, keyboard focus,
 *    scroll or wheel (pointer movement alone never counts), and
 *  - leaving it: switching conversation, going back to the list, unmount.
 *
 * Returns the capture-phase handlers to spread on the thread's root element.
 */
export function useThreadReadTracking(
  activeConversation: TrackedConversation | null,
) {
  const markConversationRead = useMarkConversationRead()

  const onInteraction = () => {
    if (activeConversation && isConversationUnread(activeConversation)) {
      markConversationRead(activeConversation)
    }
  }

  // Latest snapshot of the open conversation, refreshed after every commit so
  // a message that arrived while it was open is reflected. On the commit that
  // switches conversations React runs the leave cleanup below before this
  // effect, so the ref still holds the conversation being left.
  const activeConversationId = activeConversation?.id ?? null
  const latestActiveConversationRef = useRef(activeConversation)
  useEffect(() => {
    latestActiveConversationRef.current = activeConversation
  })
  useEffect(
    () => () => {
      const leaving = latestActiveConversationRef.current
      if (
        leaving?.id === activeConversationId &&
        isConversationUnread(leaving)
      ) {
        markConversationRead(leaving)
      }
    },
    [activeConversationId, markConversationRead],
  )

  return {
    onClickCapture: onInteraction,
    onFocusCapture: onInteraction,
    onScrollCapture: onInteraction,
    onWheelCapture: onInteraction,
  }
}
