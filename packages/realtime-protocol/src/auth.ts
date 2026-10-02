import { type JWTPayload, jwtVerify, SignJWT } from "jose"
import { z } from "zod"

const ALGORITHM = "HS256"
export const REALTIME_TOKEN_TTL_SECONDS = 60
const BEARER_SCHEME = "Bearer"

/**
 * Clock-skew tolerance between the realtime server and the builder, which
 * deploy separately and drift by NTP-class amounts. Kept short relative to the
 * 60s token TTL so it doesn't widen the replay window.
 */
export const CLOCK_TOLERANCE_SECONDS = 5

/**
 * How long a `realtime:revoked:{workspaceId}:{userId}` marker (written by
 * `revokeWorkspaceMemberRealtimeConnections`) must outlive a token: any token
 * minted before the marker is written is guaranteed to have expired (per the
 * JWT's own `exp`, which this TTL mirrors) by the time the marker itself
 * expires, so once the marker is gone every token that could still pass
 * `verifyMemberConnectToken` was necessarily minted after the revoke. See
 * PR #1349 round-4 finding #5.
 */
export const REALTIME_MEMBER_REVOKED_TTL_SECONDS =
  REALTIME_TOKEN_TTL_SECONDS + CLOCK_TOLERANCE_SECONDS

/**
 * Every purpose a realtime token can be minted for. Bound into the payload and
 * checked on verify, so a token minted for one purpose can never be replayed
 * against another.
 */
export const REALTIME_TOKEN_PURPOSE = {
  /** A member's short-lived room-connect token (`signMemberConnectToken`). */
  memberConnect: "member-connect",
  /** A guest's short-lived room-connect token. */
  guestConnect: "guest-connect",
  /** The realtime server's periodic presence report to the builder. */
  presenceReport: "presence-report",
} as const

export type RealtimeTokenPurpose =
  (typeof REALTIME_TOKEN_PURPOSE)[keyof typeof REALTIME_TOKEN_PURPOSE]

export type RealtimeAudienceKind = "workspace" | "guest"

export interface RealtimeAudience {
  id: string
  kind: RealtimeAudienceKind
}

const formatAudience = ({ kind, id }: RealtimeAudience): string =>
  `${kind}:${id}`

const encodedSecrets = new Map<string, Uint8Array>()

const encodeSecret = (secret: string): Uint8Array => {
  const encodedSecret = encodedSecrets.get(secret)
  if (encodedSecret) {
    return encodedSecret
  }

  const encoded = new TextEncoder().encode(secret)
  encodedSecrets.set(secret, encoded)
  return encoded
}

/**
 * Extra claims carried in the JWT payload alongside the `aud` room binding. A
 * generic bag so this primitive stays caller-agnostic; each caller defines and
 * validates its own shape.
 */
export type RealtimeTokenClaims = Record<string, unknown>

/**
 * Not exported: every caller mints through a purpose-specific wrapper
 * (`signMemberConnectToken`, `signGuestConnectToken`,
 * `signPresenceReportToken`) so each purpose's claims are typed and
 * validated at its own call site instead of callers building an untyped
 * claims bag by hand against this primitive directly.
 */
const signRealtimeToken = async (
  audience: RealtimeAudience,
  purpose: RealtimeTokenPurpose,
  secret: string,
  claims: RealtimeTokenClaims = {},
): Promise<string> =>
  await new SignJWT({ ...claims, purpose })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setAudience(formatAudience(audience))
    .setExpirationTime(`${REALTIME_TOKEN_TTL_SECONDS}s`)
    .sign(encodeSecret(secret))

/**
 * Verifies signature, expiry, `aud` (the room binding every caller relies on)
 * and `purpose`, then returns the decoded payload so callers can read their own
 * extra claims. `CLOCK_TOLERANCE_SECONDS` absorbs deploy-to-deploy clock drift.
 */
export const verifyRealtimeToken = async (
  token: string,
  audience: RealtimeAudience,
  purpose: RealtimeTokenPurpose,
  secret: string,
): Promise<JWTPayload> => {
  const { payload } = await jwtVerify(token, encodeSecret(secret), {
    algorithms: [ALGORITHM],
    audience: formatAudience(audience),
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  })
  if (payload.purpose !== purpose) {
    throw new Error("Unexpected realtime token purpose")
  }
  return payload
}

export const realtimeChatScopes = z.enum(["all", "assigned", "none"])
export type RealtimeChatScope = z.infer<typeof realtimeChatScopes>

const memberClaimsSchema = z.object({
  userId: z.string().min(1),
  chatScope: realtimeChatScopes,
  teamIds: z.array(z.string().min(1)).default([]),
  // Standard JWT "issued at" (seconds since epoch), set automatically by
  // the internal `signRealtimeToken`'s `.setIssuedAt()`. Kept (not stripped)
  // so a replayed `member-revoke` stream record older than this token's mint
  // time can be told apart from one that's genuinely newer than the
  // reconnect.
  iat: z.number(),
  // Millisecond-precision mint time, set explicitly below (jose's built-in
  // `iat` floors to whole seconds). The revoke-marker check must compare
  // `revokedAt > iatMs`, not `iat * 1000`: flooring `iat` to the start of its
  // second can put it BEFORE a revoke that landed earlier in that same
  // second, letting a member who reconnects within the same second as their
  // own revoke slip through a `>=` check on the floored value. See PR #1349
  // round-5 finding #2.
  iatMs: z.number(),
})

/** Claims carried by a room-connect token: the verified member's user id. */
export type RealtimeMemberClaims = z.infer<typeof memberClaimsSchema>

/**
 * Mints a short-lived connect token bound to a member of a workspace room:
 * `aud` carries the workspace room id (verified against `room.id` on connect)
 * and the payload carries the verified `userId`. Only the issuer (Builder,
 * after checking workspace membership) should call this.
 */
export const signMemberConnectToken = async (
  member: {
    workspaceId: string
    userId: string
    chatScope: RealtimeChatScope
    teamIds?: string[]
  },
  secret: string,
): Promise<string> =>
  signRealtimeToken(
    { kind: "workspace", id: member.workspaceId },
    REALTIME_TOKEN_PURPOSE.memberConnect,
    secret,
    {
      userId: member.userId,
      chatScope: member.chatScope,
      teamIds: member.teamIds ?? [],
      iatMs: Date.now(),
    },
  )

/**
 * Verifies a room-connect token minted by `signMemberConnectToken`. Throws on a
 * bad/expired signature, an `aud` that doesn't match `workspaceId`, or a
 * missing/malformed `userId` claim.
 */
export const verifyMemberConnectToken = async (
  token: string,
  workspaceId: string,
  secret: string,
): Promise<RealtimeMemberClaims> => {
  const payload = await verifyRealtimeToken(
    token,
    { kind: "workspace", id: workspaceId },
    REALTIME_TOKEN_PURPOSE.memberConnect,
    secret,
  )
  return memberClaimsSchema.parse(payload)
}

const guestClaimsSchema = z.object({
  guestConversationId: z.string().min(1),
  workspaceId: z.string().min(1),
})
export type RealtimeGuestClaims = z.infer<typeof guestClaimsSchema>

export const signGuestConnectToken = async (
  guest: { guestConversationId: string; workspaceId: string },
  secret: string,
): Promise<string> =>
  signRealtimeToken(
    { kind: "guest", id: guest.guestConversationId },
    REALTIME_TOKEN_PURPOSE.guestConnect,
    secret,
    guest,
  )

export const verifyGuestConnectToken = async (
  token: string,
  guestConversationId: string,
  secret: string,
): Promise<RealtimeGuestClaims> =>
  guestClaimsSchema.parse(
    await verifyRealtimeToken(
      token,
      { kind: "guest", id: guestConversationId },
      REALTIME_TOKEN_PURPOSE.guestConnect,
      secret,
    ),
  )

const presenceReportClaimsSchema = z.object({
  // Binds this token to exactly the user-id list the caller is about to
  // send, so a captured token can't be replayed with a different member
  // list — the route recomputes the same hash over the body it receives and
  // rejects on mismatch.
  bodyHash: z.string().min(1),
})
export type RealtimePresenceReportClaims = z.infer<
  typeof presenceReportClaimsSchema
>

/**
 * Mints the realtime server's periodic presence report to the builder. Its
 * own purpose claim keeps this direction from replaying a token minted for
 * the inbound-broadcast direction.
 */
export const signPresenceReportToken = async (
  args: { workspaceId: string; bodyHash: string },
  secret: string,
): Promise<string> =>
  signRealtimeToken(
    { kind: "workspace", id: args.workspaceId },
    REALTIME_TOKEN_PURPOSE.presenceReport,
    secret,
    { bodyHash: args.bodyHash },
  )

export const verifyPresenceReportToken = async (
  token: string,
  workspaceId: string,
  secret: string,
): Promise<RealtimePresenceReportClaims> =>
  presenceReportClaimsSchema.parse(
    await verifyRealtimeToken(
      token,
      { kind: "workspace", id: workspaceId },
      REALTIME_TOKEN_PURPOSE.presenceReport,
      secret,
    ),
  )

export const extractBearerToken = (
  authorizationHeader: string | null,
): string | null => {
  if (!authorizationHeader) {
    return null
  }
  const [scheme, token] = authorizationHeader.split(" ")
  if (scheme !== BEARER_SCHEME || !token) {
    return null
  }
  return token
}
