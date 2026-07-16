// A cryptographically random (128-bit), unguessable id — not the sequential
// Snowflake createId(). The webchat access token is session-scoped only (see
// webchat-access-token.ts) and does not bind to this id, so possession of the
// id itself is the only remaining evidence that a caller previously created
// this guest session; a sequential/enumerable id would let anyone mint a
// valid token for a stranger's conversation just by guessing nearby ids.
export const createGuestConversationId = (workspaceId: string) =>
  `${workspaceId}:${crypto.randomUUID()}`
