/**
 * Registry of in-flight "mark read" requests, keyed by conversation id.
 *
 * Lives apart from `useMarkConversationRead` (which pulls in the server
 * action) so client-only code such as the row menu can consult it without
 * importing server modules.
 */
export type InFlightRead = {
  request: Promise<void>
  /** Activity the request was issued for, as epoch ms; null when none. */
  activityAt: number | null
  /**
   * The "mark unread" write this read was queued behind, if any. A read
   * issued while a different (or no) write was pending must not be reused
   * for a reopen that happens after the write began, or the reopen's read
   * would complete before the write and the thread would end up unread.
   */
  behindUnread: Promise<void> | undefined
}

// Module-wide so every hook instance (active row, thread pane) shares it:
// click, scroll and leave can all fire for the same conversation within one
// tick, and one request in flight per conversation is enough.
export const inFlightReadByConversationId = new Map<string, InFlightRead>()

/**
 * Resolves once no read request is in flight for the conversation. "Mark as
 * unread" awaits this before writing, so a read the agent triggered a moment
 * earlier (leaving the thread, a scroll) cannot land after the unread write
 * and quietly undo it on the server.
 */
export const waitForPendingRead = (conversationId: string): Promise<void> =>
  inFlightReadByConversationId.get(conversationId)?.request ?? Promise.resolve()

const pendingUnreadByConversationId = new Map<string, Promise<void>>()

/**
 * Registers an in-flight "mark unread" write. Reads issued for the same
 * conversation wait behind it (`waitForPendingUnread`) so a deliberate reopen
 * right after "Mark as Unread" cannot have its read overtaken by the unread
 * write and end up unread on the server. The promise must never reject.
 */
export const registerPendingUnread = (
  conversationId: string,
  write: Promise<void>,
): void => {
  pendingUnreadByConversationId.set(conversationId, write)
  write.finally(() => {
    if (pendingUnreadByConversationId.get(conversationId) === write) {
      pendingUnreadByConversationId.delete(conversationId)
    }
  })
}

/** The in-flight unread write for the conversation, if any. */
export const getPendingUnread = (
  conversationId: string,
): Promise<void> | undefined =>
  pendingUnreadByConversationId.get(conversationId)

export const waitForPendingUnread = (conversationId: string): Promise<void> =>
  getPendingUnread(conversationId) ?? Promise.resolve()
