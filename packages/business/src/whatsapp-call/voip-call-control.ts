import type {
  WhatsappCallStatus,
  WhatsappCallTerminalStatus,
} from "@chatbotx.io/database/partials"

/**
 * VoIP call-control phases, persisted at `voip:ctrl:<wacid>` in Redis. See
 * `docs/whatsapp-calling-voip.md` "Atomic routing + fenced accept".
 *
 * `dialing`/`ringing` are the outbound counterparts of
 * `reserved`/`answering`, on the SAME key namespace — so every wacid-keyed
 * consumer (`endCall`, `handleExpire`, the hangup beacon, …) works for both
 * directions unchanged.
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
 * Safety-net TTL once a call is `accepted` — the answer deadline no longer
 * applies, so this only bounds how long an abandoned key lingers.
 *
 * `heartbeatActiveCall` renews on this same TTL, so a control that vanished
 * early was LOST by Redis, not expired. That is why a missing control reads
 * as "unknown" rather than "ended", and why durable DB liveness exists too.
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
 * How often a heartbeat ALSO bumps the DB row's `updatedAt`. Redis losing
 * the control (flush/eviction/restart) must never read as "call ended", so
 * recovery needs a durable signal. Throttled far under
 * {@link ACTIVE_CALL_LIVENESS_STALE_MS}: one small write every two minutes.
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
 * Keeps a call's control key alive past its own expiry job. The job's delay
 * and the control's TTL both derive from `deadlineAt`, so without a margin
 * they race to the same instant — and BullMQ's promotion latency means the
 * key usually wins, leaving `handleExpire` with nothing to act on: no Graph
 * reject/terminate, no finalize, the Meta leg still ringing and the row
 * stuck at `ringing` until the 5-minute sweep cron.
 *
 * Every CAS that renews a still-ringing control adds it, anchoring the Redis
 * expiry at `deadlineAt + margin` while the job still fires at `deadlineAt`.
 */
export const VOIP_CONTROL_EXPIRY_MARGIN_MS = 20_000

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
   * The `WhatsappCall.status` to persist. Callers read it instead of
   * re-deriving it from `fromPhase`/`graphAction` themselves.
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
