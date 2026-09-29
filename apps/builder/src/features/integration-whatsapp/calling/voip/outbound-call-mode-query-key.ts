/**
 * Kept dependency-free so realtime code can invalidate without importing the
 * server action behind `useOutboundCallMode`. `detail(...)` extends
 * `conversation(...)`'s prefix (plus `contactInboxId`) so TanStack Query's
 * PREFIX matching lets invalidating `conversation(...)` refresh every
 * `detail(...)` variant too.
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
