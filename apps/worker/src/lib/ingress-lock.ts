/**
 * The lock that serializes everything one conversation's message ingress does
 * (insert, tracking, the realtime event, notification): `saveAndBroadcastMessage`
 * holds it for a new message, and a change that may target a message still in
 * flight waits on it before publishing, so the inbox normally receives the
 * message before the change (if the lock cannot be acquired in time the change
 * is published anyway).
 */
export const ingressConversationLockKey = (conversationId: string): string =>
  `ingress:conv:${conversationId}`
