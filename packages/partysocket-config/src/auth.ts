import { type JWTPayload, jwtVerify, SignJWT } from "jose"
import { z } from "zod"

const ALGORITHM = "HS256"
const TOKEN_TTL_SECONDS = 60
const BEARER_SCHEME = "Bearer"

/**
 * Clock-skew tolerance between the realtime server and the builder, which
 * deploy separately and drift by NTP-class amounts. Kept short relative to the
 * 60s token TTL so it doesn't widen the replay window.
 */
const CLOCK_TOLERANCE_SECONDS = 5

/**
 * Wall-clock cutoff that closes the rolling-deploy compatibility window below.
 * `exp` already bounds a purpose-less token to 60s, but a stuck old-format pod
 * could keep minting fresh ones indefinitely — so the exception expires on wall
 * time regardless of the cleanup ticket. One week past the change that
 * introduced it; see `docs/realtime.md`.
 */
export const LEGACY_PURPOSE_WINDOW_CUTOFF = new Date("2026-09-25T00:00:00.000Z")

/**
 * Every purpose a realtime token can be minted for. Bound into the payload and
 * checked on verify, so a token minted for one purpose can never be replayed
 * against another — the two workspace purposes share an audience.
 */
export const REALTIME_TOKEN_PURPOSE = {
  /** The existing builder -> party broadcast path (`onBeforeRequest`). */
  broadcast: "broadcast",
  /** A member's short-lived room-connect token (`signMemberConnectToken`). */
  memberConnect: "member-connect",
  /** The realtime server's periodic presence report to the builder. */
  presenceReport: "presence-report",
} as const

export type RealtimeTokenPurpose =
  (typeof REALTIME_TOKEN_PURPOSE)[keyof typeof REALTIME_TOKEN_PURPOSE]

export type RealtimeAudienceKind = "workspace" | "guest" | "user"

export interface RealtimeAudience {
  id: string
  kind: RealtimeAudienceKind
}

const formatAudience = ({ kind, id }: RealtimeAudience): string =>
  `${kind}:${id}`

const encodeSecret = (secret: string): Uint8Array =>
  new TextEncoder().encode(secret)

/**
 * Extra claims carried in the JWT payload alongside the `aud` room binding. A
 * generic bag so this primitive stays caller-agnostic; each caller defines and
 * validates its own shape.
 */
export type RealtimeTokenClaims = Record<string, unknown>

export const signRealtimeToken = async (
  audience: RealtimeAudience,
  purpose: RealtimeTokenPurpose,
  secret: string,
  claims: RealtimeTokenClaims = {},
): Promise<string> =>
  await new SignJWT({ ...claims, purpose })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setAudience(formatAudience(audience))
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(encodeSecret(secret))

/** Extra, per-call verification options for `verifyRealtimeToken`. */
export interface VerifyRealtimeTokenOptions {
  /**
   * Accepts a token with no `purpose` claim, for the rolling-deploy window
   * where an old pod may still mint purpose-less `broadcast` tokens. Only
   * `verifyBroadcastRequest` opts in — `member-connect`/`presence-report`
   * share the same audience and never had purpose-less tokens, so opting
   * them in would allow cross-purpose replay. Self-closes at
   * `LEGACY_PURPOSE_WINDOW_CUTOFF`.
   * TODO(2026-09-18): delete once no pre-`purpose` process can be running.
   */
  allowLegacyMissingPurpose?: boolean
}

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
  options: VerifyRealtimeTokenOptions = {},
): Promise<JWTPayload> => {
  const { payload } = await jwtVerify(token, encodeSecret(secret), {
    algorithms: [ALGORITHM],
    audience: formatAudience(audience),
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  })
  const isWithinLegacyWindow =
    options.allowLegacyMissingPurpose === true &&
    Date.now() < LEGACY_PURPOSE_WINDOW_CUTOFF.getTime()
  const isLegacyMissingPurpose =
    isWithinLegacyWindow && payload.purpose === undefined
  if (!isLegacyMissingPurpose && payload.purpose !== purpose) {
    // A purpose-less token rejected because the window has closed is told apart
    // from an outright bad one, so an operator reading the log knows a stuck
    // pre-`purpose` pod — not an attacker — is the cause.
    throw new Error(
      payload.purpose === undefined && options.allowLegacyMissingPurpose
        ? "Realtime token has no purpose claim and the legacy compatibility window has closed"
        : "Unexpected realtime token purpose",
    )
  }
  return payload
}

const memberClaimsSchema = z.object({
  userId: z.string().min(1),
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
  member: { workspaceId: string; userId: string },
  secret: string,
): Promise<string> =>
  signRealtimeToken(
    { kind: "workspace", id: member.workspaceId },
    REALTIME_TOKEN_PURPOSE.memberConnect,
    secret,
    { userId: member.userId },
  )

/**
 * Verifies a room-connect token minted by `signMemberConnectToken`. Throws on a
 * bad/expired signature, an `aud` that doesn't match `workspaceId`, or a
 * missing/malformed `userId` claim.
 * Never passes `allowLegacyMissingPurpose`: no purpose-less token of this kind
 * has ever existed, and accepting one would let it replay as a broadcast
 * token — both bind the same `workspace:<id>` audience under the same secret.
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
