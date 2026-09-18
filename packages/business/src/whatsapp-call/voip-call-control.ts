import type {
  WhatsappCallStatus,
  WhatsappCallTerminalStatus,
} from "@chatbotx.io/database/partials"

/**
 * VoIP call-control phases, persisted at voip:ctrl:<wacid> in Redis.
 * dialing/ringing are the outbound counterparts of reserved/answering on the
 * same key namespace, so every wacid-keyed consumer works for both directions
 * unchanged.
 */
export type VoipCallPhase =
  | "reserved"
  | "answering"
  | "accepted"
  | "terminated"
  | "dialing"
  | "ringing"

/** Which side initiated the call. Mirrors WhatsappCallDirection. */
export type VoipCallDirection = "userInitiated" | "businessInitiated"

export type VoipCallControl = {
  /**
   * The agent bound to the call. Empty while ring-all is still in progress; set
   * to the winner on claimForAnswer. For an outbound call this is the
   * initiating agent from creation — there is no unclaimed state.
   */
  reservedUserId: string
  phase: VoipCallPhase
  /**
   * Absent for inbound calls. businessInitiated for every outbound control
   * created by startOutboundDial.
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
 * The webhook-delivered SDP answer for an outbound call, stashed by attemptId
 * (the only id known before Meta returns a wacid) — the outbound counterpart of
 * VoipOfferRecord.
 */
export type VoipOutboundAnswerRecord = {
  sdp: string
}

export const offerKey = (wacid: string): string => `voip:offer:${wacid}`
export const controlKey = (wacid: string): string => `voip:ctrl:${wacid}`
export const outboundAnswerKey = (attemptId: string): string =>
  `voip:out:answer:${attemptId}`

/**
 * A reservation/offer TTL is never allowed to collapse to zero or negative —
 * this floor keeps the Redis write meaningful long enough for the signaling job
 * to observe and expire it deliberately.
 */
export const MIN_RESERVATION_TTL_MS = 5000

/**
 * Safe margin under Meta's 30-60s answer window — the offer TTL, the control's
 * deadlineAt, and the durable expiry job all derive from this value so the
 * webhook-boundary deadline can never drift from enforcement.
 */
export const VOIP_ANSWER_DEADLINE_MS = 55_000

/**
 * Safety-net TTL once a call is accepted — the deadline no longer applies, so
 * this only bounds how long an abandoned key lingers.
 * heartbeatActiveCall renews this same TTL, so a control that vanished early
 * was lost by Redis, not expired — hence a missing control reads as unknown
 * rather than ended, and durable DB liveness exists too.
 */
export const ACTIVE_CALL_CONTROL_TTL_MS = 4 * 60 * 60 * 1000

/** Short retention after termination — long enough for a redelivered webhook to observe it, then let it expire. */
export const TERMINATED_CONTROL_TTL_MS = 60_000

/**
 * How long an accepted row must have gone without a liveness heartbeat before a
 * new dial to the same contact may treat it as stranded. The browser refreshes
 * every couple of minutes, so this is many missed beats, not a tight race.
 */
export const ACTIVE_CALL_LIVENESS_STALE_MS = 30 * 60 * 1000

/** lastError for a call closed by recoverStrandedAcceptedCall. */
export const STRANDED_CALL_RECOVERED_LAST_ERROR =
  "stranded-accepted-recovered-on-dial"

/**
 * How often a heartbeat also bumps the DB row's updatedAt. Redis losing the
 * control must never read as call ended, so recovery needs a durable signal —
 * throttled far under the liveness threshold, one small write every two
 * minutes.
 */
export const ACTIVE_CALL_ROW_TOUCH_INTERVAL_MS = 2 * 60 * 1000

/**
 * Safety margin under Meta's answer deadline for every server-side check before
 * a claim/pre_accept/accept Graph call: a call within this many ms of
 * deadlineAt is treated as already expired, so a race with Meta's own timeout
 * always resolves against calling Graph.
 */
export const VOIP_ANSWER_DEADLINE_SAFETY_MARGIN_MS = 3000

/**
 * Keeps a call's control key alive past its own expiry job. Without this
 * margin, job delay and control TTL race the same instant and BullMQ's
 * promotion latency usually wins, leaving handleExpire nothing to act on.
 */
export const VOIP_CONTROL_EXPIRY_MARGIN_MS = 20_000

/**
 * Table-driven allowed transitions — the only place phase adjacency is decided,
 * so every CAS below checks membership here instead of a sprawling if/else.
 */
export const ALLOWED_TRANSITIONS: Record<
  VoipCallPhase,
  readonly VoipCallPhase[]
> = {
  reserved: ["answering", "terminated"],
  answering: ["accepted", "terminated"],
  accepted: ["terminated"],
  terminated: [],
  // Outbound: dialing -> ringing -> accepted, with a direct dialing -> accepted
  // shortcut for when Meta's RINGING status is skipped/delayed relative to
  // ACCEPTED.
  dialing: ["ringing", "accepted", "terminated"],
  ringing: ["accepted", "terminated"],
}

export const isTransitionAllowed = (
  from: VoipCallPhase,
  to: VoipCallPhase,
): boolean => ALLOWED_TRANSITIONS[from].includes(to)

/**
 * Server-side deadline enforcement: true once deadlineAt is within the safety
 * margin of now (or past), checked before every claim/pre_accept/accept Graph
 * call so an in-flight answer never wins a race already lost to Meta's timeout.
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
   * When false, an already-accepted call is refused (returns null): the
   * deadline/expiry path passes false so a timeout observing answering can
   * never CAS-downgrade a call that reached accepted a moment later. The hangup
   * path passes true.
   */
  allowFromAccepted: boolean
}

export type EndVoipCallResult = {
  /** The phase the call was in when this termination won the CAS. */
  fromPhase: VoipCallPhase
  /**
   * reject only when the call never left reserved; every later phase means a
   * pre_accept/accept handshake may have started with Meta, so terminate is
   * correct.
   */
  graphAction: VoipGraphEndAction
  /**
   * The WhatsappCall.status to persist. Callers read it instead of re-deriving
   * it from fromPhase/graphAction.
   */
  terminalStatus: WhatsappCallTerminalStatus
}

/**
 * Phase -> (Graph action, terminal DB status) lookup. `reject` applies only to
 * `reserved` (inbound decline); every other phase uses `terminate`.
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
 * control record does not exist (webhook bound the id before the dial created
 * one, or Redis lost it). Terminal statuses have no entry.
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
