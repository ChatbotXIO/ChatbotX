import { type JWTPayload, jwtVerify, SignJWT } from "jose"
import { z } from "zod"

const ALGORITHM = "HS256"
const TOKEN_TTL_SECONDS = 60
const BEARER_SCHEME = "Bearer"

/**
 * Small, deliberately tight tolerance for clock skew between the realtime
 * server and the builder — two separately deployed processes whose clocks
 * are not guaranteed to be perfectly in sync (NTP-class drift). Kept short
 * relative to the 60s token TTL so it absorbs ordinary skew without
 * meaningfully widening the window a captured token could be replayed in
 * (MEDIUM-3/LOW-12).
 */
const CLOCK_TOLERANCE_SECONDS = 5

/**
 * Absolute wall-clock cutoff for the BLOCKER-a rolling-deploy compatibility
 * window (round-2 review, tightened same day as it was introduced). A
 * single purpose-less ("legacy") broadcast token is already bounded to 60s
 * of replay by `exp` — but an old-format `apps/builder`/`apps/worker` pod
 * that stays up longer than an ordinary rolling deploy (a stuck/zombie
 * deploy, not the common case) could otherwise keep MINTING fresh
 * purpose-less tokens indefinitely, each individually valid. This constant
 * makes the exception self-closing regardless of any single token's `iat`:
 * once wall time passes it, `verifyRealtimeToken` stops granting the legacy
 * exception at all, independent of whether the follow-up removal ticket
 * (deleting this compat code once no pre-purpose-claim process can still be
 * running — see `docs/realtime.md` and
 * `docs/whatsapp-calling-parity-plan.md` §9) has landed yet. Set
 * one week past this change (2026-09-18), generous for any real-world
 * rolling deploy of this repo's few services.
 */
export const LEGACY_PURPOSE_WINDOW_CUTOFF = new Date("2026-09-25T00:00:00.000Z")

/**
 * Every purpose a realtime token can be minted for — bound into the token
 * payload (`purpose` claim) and checked on verify, so a token minted for
 * one purpose (e.g. the workspace broadcast path) can never be replayed
 * against a different one (e.g. the presence-report route), even when both
 * happen to target the same audience/room (MEDIUM-3).
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
 * Optional extra claims carried inside the JWT payload, on top of the
 * `aud` room binding. Kept as a generic string-keyed bag here (not typed to
 * any one caller's shape) so this primitive stays channel-agnostic — callers
 * define and validate their own claim shape (see `memberClaimsSchema` below
 * for the room-connect use case).
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

/**
 * Extra, per-call verification options for {@link verifyRealtimeToken}.
 */
export interface VerifyRealtimeTokenOptions {
  /**
   * One-release rolling-deploy compatibility window (round-2 review,
   * BLOCKER-a; tightened same day after a follow-up security pass). During
   * a deploy where `apps/realtime` ships before `apps/builder`/`apps/worker`
   * — the ONLY two processes that ever mint a `broadcast`-purpose token,
   * via the shared `packages/partysocket-config/src/lib.ts` — a token
   * minted by the not-yet-updated process carries no `purpose` claim at
   * all (production `main`, before this branch, had no `purpose` concept
   * whatsoever). Without this escape hatch EVERY realtime broadcast
   * (`verifyBroadcastRequest`) — including call ring/answer/ended events —
   * would 401 for the whole rollout window. There is no enforced or
   * documented deploy ordering that would make this unnecessary:
   * `scripts/deployment/upgrade.sh` stops/starts `builder worker realtime`
   * as one undifferentiated group, so a staggered/rolling deploy in any
   * real environment can land in either order.
   *
   * Deliberately narrow, NOT a blanket exception:
   * - Only `verifyBroadcastRequest` opts in. `verifyMemberConnectToken`
   *   deliberately does NOT (see its own doc comment) — that purpose is
   *   brand new to this branch, so no purpose-less token of that kind has
   *   ever existed, and granting it the same exception would have let a
   *   purpose-less token minted for ONE of these two purposes be replayed
   *   as the other: both bind to the identical `workspace:<id>` audience
   *   shape for the same room, so with the exception on both sides a
   *   member-connect token could impersonate a broadcast-authorized
   *   request (able to `room.broadcast`/target-send/revoke) under the same
   *   shared `REALTIME_BROADCAST_SECRET`. The presence-report path was
   *   already strict (no legacy tokens of that purpose ever existed, and
   *   it additionally requires a `bodyHash` claim no legacy token could
   *   carry).
   * - Self-closing: only honored while `Date.now()` is before
   *   {@link LEGACY_PURPOSE_WINDOW_CUTOFF} — see that constant's doc
   *   comment. A PRESENT-but-wrong purpose is rejected unconditionally,
   *   regardless of this option or the cutoff.
   *
   * TODO(follow-up, dated 2026-09-18): remove this compatibility window
   * once no token minted by a pre-`purpose`-claim process can still be in
   * flight — expected well before {@link LEGACY_PURPOSE_WINDOW_CUTOFF},
   * which is only a backstop (see `docs/realtime.md`'s "Safe deploy order"
   * section and `docs/whatsapp-calling-parity-plan.md` §9).
   */
  allowLegacyMissingPurpose?: boolean
}

/**
 * Verifies the token's signature, expiry, and `aud` claim against
 * `audience` — `jwtVerify` throws when the token's audience does not match,
 * which is the room-binding check every caller (broadcast auth, member
 * connect auth, presence-report auth) relies on. Also rejects when the
 * token's `purpose` claim does not match `purpose` (MEDIUM-3): direction-
 * and body-agnostic tokens meant one such replay possible before — a
 * presence-report token could be minted with any `userIds` and stay valid
 * for its whole 60s TTL, and a broadcast token could be replayed against
 * the presence-report route or vice versa. A small clock-skew tolerance
 * (`CLOCK_TOLERANCE_SECONDS`) is applied so ordinary NTP-class drift
 * between the realtime server and the builder never silently rejects every
 * token. `options.allowLegacyMissingPurpose` (see
 * {@link VerifyRealtimeTokenOptions}) treats a token with NO `purpose`
 * claim as legacy-valid rather than rejecting it, but ONLY before
 * {@link LEGACY_PURPOSE_WINDOW_CUTOFF} — used only by
 * `verifyBroadcastRequest`; a PRESENT-but-wrong purpose is rejected
 * regardless of this option or the cutoff. Returns the decoded payload so
 * callers can read any extra claims `signRealtimeToken` embedded.
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
    // A purpose-less token rejected *because the window has closed* is told
    // apart from an outright bad one, so an operator reading the log knows a
    // stuck pre-`purpose` pod — not an attacker — is the cause.
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
 * `aud` carries the workspace room id (verified against `room.id` on
 * connect — see `verifyMemberConnectToken`) and the payload carries the
 * verified `userId`. Only the issuer (Builder, after checking workspace
 * membership) should call this.
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
 * Verifies a room-connect token minted by `signMemberConnectToken`. Rejects
 * (throws) when the signature is invalid/expired, when the token's `aud`
 * does not match `workspaceId` (cross-room replay), or when the `userId`
 * claim is missing/malformed — a token missing the claim is never silently
 * trusted.
 *
 * Deliberately STRICT — never passes `allowLegacyMissingPurpose` (BLOCKER-a
 * round-2 tightening): the `member-connect` purpose, `signMemberConnectToken`,
 * and this verifier are all brand new to this branch. Production `main`'s
 * `onBeforeConnect` never minted a JWT for this purpose at all — it
 * authenticated via a session cookie (`getAuthSession`) — so there is no
 * pre-existing purpose-less token this path must stay compatible with, and
 * therefore no reason to accept one. Confirmed by diffing this file against
 * `apps/realtime/src/parties/workspaces.ts` on `main` before this branch.
 * A blanket legacy exception here would additionally have been a privilege
 * escalation: `verifyBroadcastRequest` and this verifier both bind to the
 * SAME `workspace:<id>` audience shape for the same room, so a purpose-less
 * member-connect token (had one existed) could have been replayed as a
 * broadcast-authorized request — able to `room.broadcast`/target-send/revoke
 * — under the SAME shared `REALTIME_BROADCAST_SECRET`. Keeping this strict
 * closes that off structurally: the legacy exception now exists on exactly
 * one call site (`verifyBroadcastRequest`), the only one with real
 * pre-existing purpose-less tokens in flight.
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
