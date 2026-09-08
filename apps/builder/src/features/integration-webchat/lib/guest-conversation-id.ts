import { z } from "zod"

// A cryptographically random (128-bit), unguessable id — not the sequential
// Snowflake createId(). The webchat access token is session-scoped only (see
// webchat-access-token.ts) and does not bind to this id, so possession of the
// id itself is the only remaining evidence that a caller previously created
// this guest session; a sequential/enumerable id would let anyone mint a
// valid token for a stranger's conversation just by guessing nearby ids.
export const createGuestConversationId = (workspaceId: string) =>
  `${workspaceId}:${crypto.randomUUID()}`

// Two accepted shapes, and both must stay accepted: the `<workspaceId>:<uuid>`
// form minted above, and the legacy digits-only Snowflake that returning
// visitors still carry in localStorage (migrated by readLegacyGuestId). This is
// deliberately NOT zodBigintAsString() — the current form is not digits-only,
// and validating it as a bigint leaves every new visitor's message input
// permanently invalid (the send button never enables).
const GUEST_CONVERSATION_ID_REGEX =
  /^\d+(?::[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i

export const zodGuestConversationId = () =>
  z.string().regex(GUEST_CONVERSATION_ID_REGEX)
