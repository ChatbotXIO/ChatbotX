/**
 * Cache key for `useOutboundCallMode`. Kept dependency-free so realtime code
 * can invalidate it without importing the server action behind the hook.
 */
export const outboundCallModeQueryKey = (
  workspaceId: string | undefined,
  conversationId: string | undefined,
) => ["whatsapp-outbound-call-mode", workspaceId, conversationId] as const
