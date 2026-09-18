import type {
  WhatsappCallStatus,
  WhatsappCallTerminalStatus,
} from "@chatbotx.io/database/partials"

/**
 * VoIP-mode (browser WebRTC) call-control phases. Persisted at
 * `voip:ctrl:<wacid>` in Redis (short-TTL — bounded by Meta's 30-60s answer
 * window until `accepted`; a longer safety-net TTL afterward). See
 * `docs/whatsapp-calling-voip.md` "Atomic routing + fenced accept".
 *
 * `dialing`/`ringing` are the outbound (business-initiated) counterparts of
 * `reserved`/`answering`: the SAME control key/namespace is reused for both
 * directions (`voip:ctrl:<wacid>`, never a separate `voip:out:ctrl:`), so
 * every existing wacid-keyed consumer (`endCall`, `endVoipCallAsAgent`,
 * `emitVoipCallEnded`, `handleExpire`, the hangup beacon) keeps working
 * unchanged for outbound calls.
 */
export type VoipCallPhase =
  | "reserved"
  | "answering"
  | "accepted"
  | "terminated"
  | "dialing"
  | "ringing"

/** Which side initiated the call. Mirrors `WhatsappCallDirection`. */
export type VoipCallDirection = "userInitiated" | "businessInitiated"

export type VoipCallControl = {
  /**
   * The agent bound to the call. Empty string (`""`) while the call is still
   * ringing every eligible agent (ring-all); set
   * to the winner's id the moment one of them claims it (`claimForAnswer`).
   * For an outbound call this is the initiating agent from the moment the
   * control is created (`startOutboundDial`) — there is no "unclaimed" state.
   */
  reservedUserId: string
  phase: VoipCallPhase
  /**
   * Absent for inbound calls (unchanged shape/behavior). `businessInitiated`
   * for every outbound control created by `startOutboundDial`.
   */
  direction?: VoipCallDirection
  /** Epoch ms — Meta's answer deadline for this call. */
  deadlineAt: number
  /** Minted once when the control is created; carried through every subsequent CAS. */
  fenceToken: string
}

export type VoipOfferRecord = {
  sdp: string
  /** Epoch ms — mirrors the control record's deadline for observability. */
  deadlineAt: number
}

/**
 * The webhook-delivered SDP answer for an outbound (business-initiated)
 * call, stashed by `attemptId` (the only id known before Meta returns a
 * `wacid`) — the outbound counterpart of `VoipOfferRecord`.
 */
export type VoipOutboundAnswerRecord = {
  sdp: string
}

export const offerKey = (wacid: string): string => `voip:offer:${wacid}`
export const controlKey = (wacid: string): string => `voip:ctrl:${wacid}`
export const outboundAnswerKey = (attemptId: string): string =>
  `voip:out:answer:${attemptId}`

/**
 * A reservation/offer TTL is never allowed to collapse to zero or negative
 * (a connect webhook that arrives right at, or after, its own deadline)
 * — this floor keeps the Redis write meaningful long enough for the
 * signaling job to observe and expire it deliberately, instead of the key
 * vanishing before anything can react to it.
 */
export const MIN_RESERVATION_TTL_MS = 5000

/**
 * Safe margin under Meta's 30-60s answer window — the offer TTL, the control record's
 * `deadlineAt`, and the durable expiry job all derive from this single
 * value, so the webhook-boundary deadline can never drift from the
 * consumer's own enforcement.
 */
export const VOIP_ANSWER_DEADLINE_MS = 55_000

/**
 * Safety-net TTL for the control record once a call reaches `accepted`.
 * The answer-deadline TTL no longer applies once a call is live; the real
 * end-of-call cleanup is a later phase (worker-driven), this only bounds
 * how long an abandoned key can linger in Redis.
 *
 * A live call's heartbeat (`heartbeatActiveCall`) renews the control on this
 * same TTL, so a control that vanished early was lost by Redis rather than
 * expired — which is why a missing control is only ever "unknown", never
 * "the call ended", and why the durable DB liveness exists alongside it.
 */
export const ACTIVE_CALL_CONTROL_TTL_MS = 4 * 60 * 60 * 1000

/** Short retention after termination — long enough for a redelivered webhook to observe it, then let it expire. */
export const TERMINATED_CONTROL_TTL_MS = 60_000

/**
 * How long an `accepted` row must have gone without a liveness heartbeat
 * before a NEW dial to the same contact may treat it as stranded — see
 * {@link WhatsappVoipCallService.recoverStrandedAcceptedCall}. The browser
 * refreshes the row every couple of minutes
 * ({@link ACTIVE_CALL_ROW_TOUCH_INTERVAL_MS}), so this is many missed beats,
 * not a tight race.
 */
export const ACTIVE_CALL_LIVENESS_STALE_MS = 30 * 60 * 1000

/** `lastError` for a call closed by {@link WhatsappVoipCallService.recoverStrandedAcceptedCall}. */
export const STRANDED_CALL_RECOVERED_LAST_ERROR =
  "stranded-accepted-recovered-on-dial"

/**
 * How often an active-call heartbeat ALSO bumps the DB row's `updatedAt`
 * (`whatsappCallRepository.touchLivenessIfStale`). The control record alone is
 * not enough: Redis losing it (flush/eviction/restart) must never look like
 * "the call ended", so recovery needs a durable liveness signal it can trust.
 * Throttled well under {@link ACTIVE_CALL_LIVENESS_STALE_MS} so a live call's
 * row is always fresher than the staleness threshold by a wide margin, while a
 * 20-second heartbeat still costs at most one tiny write every two minutes.
 */
export const ACTIVE_CALL_ROW_TOUCH_INTERVAL_MS = 2 * 60 * 1000

/**
 * Safety margin under Meta's answer deadline for every server-side
 * check before a claim/`pre_accept`/`accept` Graph call: a call within this
 * many ms of `deadlineAt` is treated as already expired, so a race between
 * "we still have budget" and Meta's own timeout always resolves in favor of
 * NOT calling Graph.
 */
export const VOIP_ANSWER_DEADLINE_SAFETY_MARGIN_MS = 3000

/**
 * Margin that makes `startOutboundDial`'s control key outlive its own expiry
 * job. Without it the TTL would be exactly `remainingTtlMs(deadlineAt)` — the
 * SAME value `enqueueOutboundDialExpiry` uses as the job's delay — so by the
 * time `expireOutboundDial` ran (at/after `deadlineAt`), the control key would
 * already be gone. `endCall` would read `null`, return `null`, and the worker
 * would do NOTHING: no Graph terminate, no finalize — a silent no-answer no-op
 * leaving the real Meta leg ringing and the DB row stuck `ringing` forever.
 * With the margin, `endCall` can still observe (and terminate) the control
 * when the job runs right at the deadline. Deliberately NOT
 * applied to any INBOUND control TTL (`reserveIncomingCall`) — those are
 * unaffected by this bug and out of scope here.
 */
export const OUTBOUND_CONTROL_TTL_MARGIN_MS = 20_000

/**
 * Table-driven allowed transitions — the only place phase adjacency is
 * decided, so every CAS call below checks membership here instead of a
 * sprawling if/else per phase.
 */
export const ALLOWED_TRANSITIONS: Record<
  VoipCallPhase,
  readonly VoipCallPhase[]
> = {
  reserved: ["answering", "terminated"],
  answering: ["accepted", "terminated"],
  accepted: ["terminated"],
  terminated: [],
  // Outbound (business-initiated): dialing -> ringing -> accepted, with a
  // direct dialing -> accepted shortcut for when Meta's RINGING status is
  // skipped/delayed relative to ACCEPTED.
  dialing: ["ringing", "accepted", "terminated"],
  ringing: ["accepted", "terminated"],
}

export const isTransitionAllowed = (
  from: VoipCallPhase,
  to: VoipCallPhase,
): boolean => ALLOWED_TRANSITIONS[from].includes(to)

/**
 * Server-side deadline enforcement: `true` once `deadlineAt` is within
 * {@link VOIP_ANSWER_DEADLINE_SAFETY_MARGIN_MS} of now (or already past),
 * checked before every claim/`pre_accept`/`accept` Graph call in
 * `answerWhatsappVoipCallAction` so an in-flight answer attempt never wins a
 * race it has effectively already lost to Meta's own timeout.
 */
export const isAnswerDeadlineExpired = (deadlineAt: number): boolean =>
  Date.now() + VOIP_ANSWER_DEADLINE_SAFETY_MARGIN_MS >= deadlineAt

export const remainingTtlMs = (deadlineAt: number): number =>
  Math.max(deadlineAt - Date.now(), MIN_RESERVATION_TTL_MS)

/** Graph action Meta expects when ending a call, derived from its phase. */
export type VoipGraphEndAction = "reject" | "terminate"

export type EndVoipCallInput = {
  wacid: string
  /**
   * When `false`, an already-`accepted` call is refused (returns `null`): the
   * deadline/expiry path passes `false` so a timeout that observed
   * `answering` can never CAS-downgrade a call that reached `accepted` a
   * moment later. The hangup path passes `true` — ending a live call is its
   * entire purpose.
   */
  allowFromAccepted: boolean
}

export type EndVoipCallResult = {
  /** The phase the call was in when this termination won the CAS. */
  fromPhase: VoipCallPhase
  /**
   * `reject` only when the call never left `reserved` (nobody ever answered);
   * every later phase means a `pre_accept`/`accept` handshake may have started
   * with Meta, so `terminate` is the correct action.
   */
  graphAction: VoipGraphEndAction
  /**
   * The `WhatsappCall.status` this termination should be persisted as.
   * Callers read this instead of re-deriving it from `fromPhase`/
   * `graphAction` with their own if-chain (that pattern was previously
   * duplicated across callers as a `hangupTerminalStatus` computation).
   */
  terminalStatus: WhatsappCallTerminalStatus
}

/**
 * Phase → (Graph action, terminal DB status) lookup, keyed by every phase
 * `endCall` can terminate FROM (excludes `terminated` itself — the
 * `isTransitionAllowed(current.phase, "terminated")` guard in `endCall`
 * already rules that phase out before this table is consulted).
 *
 * - `reserved` (nobody ever answered) → Graph `reject`, DB `rejected`.
 * - `answering` (claimed but the accept handshake with Meta never
 *   completed) → Graph `terminate`, DB `failed`.
 * - `accepted` (a live call) → Graph `terminate`, DB `completed`.
 * - `dialing`/`ringing` (outbound, before Meta's user ever accepted) →
 *   Graph `terminate` — NEVER `reject`, which is inbound-decline-only and
 *   meaningless for a call WE placed — DB `failed`.
 */
export const VOIP_END_OUTCOME_BY_PHASE = {
  reserved: { graphAction: "reject", terminalStatus: "rejected" },
  answering: { graphAction: "terminate", terminalStatus: "failed" },
  accepted: { graphAction: "terminate", terminalStatus: "completed" },
  dialing: { graphAction: "terminate", terminalStatus: "failed" },
  ringing: { graphAction: "terminate", terminalStatus: "failed" },
} as const satisfies Record<
  "reserved" | "answering" | "accepted" | "dialing" | "ringing",
  {
    graphAction: VoipGraphEndAction
    terminalStatus: WhatsappCallTerminalStatus
  }
>

export type TerminableVoipCallPhase = keyof typeof VOIP_END_OUTCOME_BY_PHASE

/**
 * The control phase a still-live call row stands for, used to end a call whose
 * control record does not exist (Meta's webhook bound the call id before the
 * dial created one, or Redis lost it). Terminal statuses have no entry.
 */
export const LIVE_CALL_PHASE_BY_STATUS: Partial<
  Record<WhatsappCallStatus, Record<VoipCallDirection, TerminableVoipCallPhase>>
> = {
  ringing: { businessInitiated: "dialing", userInitiated: "reserved" },
  accepted: { businessInitiated: "accepted", userInitiated: "accepted" },
}

export const isTerminableVoipCallPhase = (
  phase: VoipCallPhase,
): phase is TerminableVoipCallPhase =>
  Object.hasOwn(VOIP_END_OUTCOME_BY_PHASE, phase)
