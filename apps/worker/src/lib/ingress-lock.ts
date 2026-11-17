/**
 * The lock that serializes everything one conversation's message ingress does
 * (insert, tracking, the realtime event, notification): `saveAndBroadcastMessage`
 * holds it for a new message, and a change to a stored message waits on it
 * before publishing, so the inbox never sees the change before the message.
 */
export const ingressConversationLockKey = (conversationId: string): string =>
  `ingress:conv:${conversationId}`
