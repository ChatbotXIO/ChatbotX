/**
 * Cache key factory for `useOutboundCallMode`. Kept dependency-free so
 * realtime code can invalidate without importing the server action behind
 * the hook.
 *
 * `detail(...)` extends `conversation(...)` (same three leading parts, plus
 * `contactInboxId`) so that TanStack Query's default PREFIX matching on
 * `invalidateQueries` means invalidating with `conversation(...)` alone
 * refreshes every `detail(...)` variant for that conversation too — the
 * header button (no `contactInboxId`), a call-back button, and a contact
 * panel dial for one specific WhatsApp number all share one invalidation
 * call. No caller should ever build either key by hand.
 */
export const outboundCallModeQueryKeys = {
  conversation: (
    workspaceId: string | undefined,
    conversationId: string | undefined,
  ) => ["whatsapp-outbound-call-mode", workspaceId, conversationId] as const,
  detail: (
    workspaceId: string | undefined,
    conversationId: string | undefined,
    contactInboxId: string | undefined,
  ) =>
    [
      ...outboundCallModeQueryKeys.conversation(workspaceId, conversationId),
      contactInboxId,
    ] as const,
}
