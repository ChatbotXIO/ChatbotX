import type { WhatsappCallStatus } from "@chatbotx.io/database/partials"
import {
  WHATSAPP_CALL_TERMINAL_STATUSES,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { casStore } from "@chatbotx.io/redis"
import {
  enqueueIntegrationJob,
  expireOutboundDialJobId,
  IntegrationJobAction,
  outboundAnswerJobId,
  WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
  WhatsappVoipSignalingJobAction,
  whatsappCallNativeRecordingFetchJobId,
  whatsappCallNativeTranscriptFetchJobId,
  whatsappVoipExpiryJobId,
  whatsappVoipSignalingJobId,
  whatsappVoipSignalingQueue,
} from "@chatbotx.io/worker-config"
import { contactService } from "../contact/service"
import { contactInboxService } from "../contact-inbox/service"
import { logger } from "../logger"
import { whatsappVoipPresenceService } from "./voip-presence-service"

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

type VoipOfferRecord = {
  sdp: string
  /** Epoch ms — mirrors the control record's deadline for observability. */
  deadlineAt: number
}

/**
 * The webhook-delivered SDP answer for an outbound (business-initiated)
 * call, stashed by `attemptId` (the only id known before Meta returns a
 * `wacid`) — the outbound counterpart of `VoipOfferRecord`.
 */
type VoipOutboundAnswerRecord = {
  sdp: string
}

const offerKey = (wacid: string): string => `voip:offer:${wacid}`
const controlKey = (wacid: string): string => `voip:ctrl:${wacid}`
const outboundAnswerKey = (attemptId: string): string =>
  `voip:out:answer:${attemptId}`

/**
 * A reservation/offer TTL is never allowed to collapse to zero or negative
 * (a connect webhook that arrives right at, or after, its own deadline)
 * — this floor keeps the Redis write meaningful long enough for the
 * signaling job to observe and expire it deliberately, instead of the key
 * vanishing before anything can react to it.
 */
const MIN_RESERVATION_TTL_MS = 5000

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
const TERMINATED_CONTROL_TTL_MS = 60_000

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
const STRANDED_CALL_RECOVERED_LAST_ERROR = "stranded-accepted-recovered-on-dial"

/**
 * How often an active-call heartbeat ALSO bumps the DB row's `updatedAt`
 * (`whatsappCallRepository.touchLivenessIfStale`). The control record alone is
 * not enough: Redis losing it (flush/eviction/restart) must never look like
 * "the call ended", so recovery needs a durable liveness signal it can trust.
 * Throttled well under {@link ACTIVE_CALL_LIVENESS_STALE_MS} so a live call's
 * row is always fresher than the staleness threshold by a wide margin, while a
 * 20-second heartbeat still costs at most one tiny write every two minutes.
 */
const ACTIVE_CALL_ROW_TOUCH_INTERVAL_MS = 2 * 60 * 1000

/**
 * Safety margin (R16) under Meta's answer deadline for every server-side
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
 * applied to any INBOUND control TTL (`resolveRingTargets`) — those are
 * unaffected by this bug and out of scope here.
 */
const OUTBOUND_CONTROL_TTL_MARGIN_MS = 20_000

/**
 * Table-driven allowed transitions — the only place phase adjacency is
 * decided, so every CAS call below checks membership here instead of a
 * sprawling if/else per phase.
 */
const ALLOWED_TRANSITIONS: Record<VoipCallPhase, readonly VoipCallPhase[]> = {
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

const isTransitionAllowed = (from: VoipCallPhase, to: VoipCallPhase): boolean =>
  ALLOWED_TRANSITIONS[from].includes(to)

/**
 * R16 server-side deadline enforcement: `true` once `deadlineAt` is within
 * {@link VOIP_ANSWER_DEADLINE_SAFETY_MARGIN_MS} of now (or already past),
 * checked before every claim/`pre_accept`/`accept` Graph call in
 * `answerWhatsappVoipCallAction` so an in-flight answer attempt never wins a
 * race it has effectively already lost to Meta's own timeout.
 */
export const isAnswerDeadlineExpired = (deadlineAt: number): boolean =>
  Date.now() + VOIP_ANSWER_DEADLINE_SAFETY_MARGIN_MS >= deadlineAt

const remainingTtlMs = (deadlineAt: number): number =>
  Math.max(deadlineAt - Date.now(), MIN_RESERVATION_TTL_MS)

export type StoreOfferInput = {
  wacid: string
  sdp: string
  deadlineAt: number
}

export type CaptureConnectOfferInput = {
  wacid: string
  sdp: string
  /** Resolves the integration (workspace/inbox/Graph auth) in the signaling consumer. */
  phoneNumberId: string
}

export type ResolveRingTargetsInput = {
  wacid: string
  workspaceId: string
  deadlineAt: number
}

/**
 * Discriminated so the signaling consumer can tell the three outcomes apart
 * and react correctly (see `docs/whatsapp-calling-voip.md`):
 * - `ring` — deliver the offer to EVERY listed agent (ring-all); the fenced
 *   CAS in `claimForAnswer` lets only the first to
 *   answer win.
 * - `noEligibleAgent` — nobody has the inbox open; the call must be Meta-`reject`ed.
 * - `alreadyProgressed` — a control record exists past `reserved` (a
 *   redelivered/retried connect landing after the call already advanced);
 *   the connect handler must NO-OP, never re-ring and never terminate, so it
 *   can't downgrade a live/accepted call.
 */
export type ResolveRingTargetsResult =
  | { status: "ring"; targets: string[] }
  | { status: "noEligibleAgent" }
  | { status: "alreadyProgressed" }

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
  terminalStatus: WhatsappCallStatus
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
const VOIP_END_OUTCOME_BY_PHASE = {
  reserved: { graphAction: "reject", terminalStatus: "rejected" },
  answering: { graphAction: "terminate", terminalStatus: "failed" },
  accepted: { graphAction: "terminate", terminalStatus: "completed" },
  dialing: { graphAction: "terminate", terminalStatus: "failed" },
  ringing: { graphAction: "terminate", terminalStatus: "failed" },
} as const satisfies Record<
  "reserved" | "answering" | "accepted" | "dialing" | "ringing",
  { graphAction: VoipGraphEndAction; terminalStatus: WhatsappCallStatus }
>

type TerminableVoipCallPhase = keyof typeof VOIP_END_OUTCOME_BY_PHASE

/**
 * The control phase a still-live call row stands for, used to end a call whose
 * control record does not exist (Meta's webhook bound the call id before the
 * dial created one, or Redis lost it). Terminal statuses have no entry.
 */
const LIVE_CALL_PHASE_BY_STATUS: Partial<
  Record<WhatsappCallStatus, Record<VoipCallDirection, TerminableVoipCallPhase>>
> = {
  ringing: { businessInitiated: "dialing", userInitiated: "reserved" },
  accepted: { businessInitiated: "accepted", userInitiated: "accepted" },
}

const isTerminableVoipCallPhase = (
  phase: VoipCallPhase,
): phase is TerminableVoipCallPhase =>
  Object.hasOwn(VOIP_END_OUTCOME_BY_PHASE, phase)

/**
 * Best-effort caller display name for the ring UI: `contactInbox -> contact
 * -> fullName`. Shared between the worker's realtime ring delivery
 * (`handleConnect`) and the builder's resume-after-refresh lookup
 * (`getResumableIncoming`), so both surfaces resolve a caller's name the
 * same way. Resolved server-side (not on the client) so the dock shows the
 * name even when the agent doesn't have that conversation loaded. A miss
 * just falls back to the dock's "unknown caller" label — never blocks the
 * ring.
 */
export const resolveWhatsappCallerName = async (
  call: WhatsappCallModel,
): Promise<string | null> => {
  try {
    const contactInbox = await contactInboxService.findBy({
      where: { id: call.contactInboxId },
    })
    if (!contactInbox) {
      return null
    }
    const contact = await contactService.findById({
      workspaceId: call.workspaceId,
      id: contactInbox.contactId,
    })
    return contact?.fullName ?? null
  } catch (error) {
    logger.warn(
      { err: error },
      "resolveWhatsappCallerName failed; falling back to null caller name",
    )
    return null
  }
}

/**
 * Shaped to match the client `useWhatsappVoipCallStore.addIncoming` payload
 * (`WhatsappVoipIncomingData`) exactly, so `getResumableIncoming`'s result can
 * be handed straight to it after an on-mount resume fetch (F5 during a still-
 * ringing call).
 */
export type StartOutboundDialInput = {
  wacid: string
  initiatorUserId: string
  deadlineAt: number
}

export type StoreOutboundAnswerInput = {
  attemptId: string
  sdp: string
}

/**
 * The webhook-boundary entry point for a BUSINESS_INITIATED `connect` event's
 * answer. `attemptId` is Meta's echoed `biz_opaque_callback_data`
 * when present; callers pass `""` when it is absent (an older/edge payload)
 * and rely on the `wacid` fallback lookup in
 * {@link WhatsappVoipCallService.captureOutboundAnswer}.
 */
export type CaptureOutboundAnswerInput = {
  attemptId: string
  wacid: string
  sdp: string
}

/**
 * The webhook-boundary entry point for a Meta-native `call_recording_available`
 * event.
 * Mirrors {@link CaptureOutboundAnswerInput}'s shape — the identifiers/URL
 * only, never the audio bytes.
 */
export type CaptureNativeRecordingAvailableInput = {
  wacid: string
  /** Graph Media API id for the recording audio (`call_recording.audio.id`). */
  audioMediaId: string
  /** Meta's short-lived (~5-min) download URL (`call_recording.audio.url`). */
  audioUrl: string
  /** e.g. `audio/ogg; codecs=opus` (`call_recording.audio.mime_type`). */
  mimeType: string
}

/**
 * The webhook-boundary entry point for a Meta-native `call_transcription_available`
 * event.
 * Mirrors {@link CaptureOutboundAnswerInput}'s shape — the identifiers/URL
 * only, never the transcript document bytes.
 */
export type CaptureNativeTranscriptAvailableInput = {
  wacid: string
  /** Graph Media API id for the transcript document (`call_transcript.document.id`). */
  documentMediaId: string
  /** Meta's short-lived download URL (`call_transcript.document.url`). */
  documentUrl: string
}

export type EnqueueOutboundDialExpiryInput = {
  attemptId: string
  whatsappCallId: string
  wacid: string
  workspaceId: string
  /** Epoch ms — Meta's user-accept deadline for this outbound dial. */
  deadlineAt: number
}

/**
 * Thrown by {@link WhatsappVoipCallService.assertNoActiveCallForContact}
 * when a `ringing`/`accepted` call (either direction) already exists for
 * the contact — the glare guard the app layer must call before dialing.
 */
export class WhatsappCallInProgressError extends Error {
  constructor(contactInboxId: string) {
    super(
      `call-in-progress: contactInbox ${contactInboxId} already has an active call`,
    )
    this.name = "WhatsappCallInProgressError"
  }
}

export type ResumableIncomingVoipCall = {
  whatsappCallId: string
  wacid: string
  conversationId: string
  contactInboxId: string
  contactName: string | null
  offer: { sdpType: "offer"; sdp: string }
  deadlineAt: string
}

/**
 * Business service for WhatsApp Business Calling VoIP mode (browser
 * WebRTC): the SDP offer stash and the fenced call-control state machine.
 * Pure orchestration over `casStore` (Redis) and existing repositories —
 * never touches `db` directly (see `AGENTS.md` invariant #9) and never
 * persists to Postgres itself (accepted-call persistence is a later phase,
 * via `whatsappCallRepository.markAcceptedIfActive`).
 */
class WhatsappVoipCallService {
  /**
   * Immutable first-seen SDP offer store: `SET NX PX=(deadlineAt-now)`, so a
   * redelivered connect webhook for the same `wacid` can neither overwrite
   * the offer nor extend its TTL. Returns whether THIS call created the
   * record (`false` means a redelivery — the caller should treat the
   * existing offer as authoritative, not retry the write).
   */
  async storeOffer(input: StoreOfferInput): Promise<boolean> {
    const record: VoipOfferRecord = {
      sdp: input.sdp,
      deadlineAt: input.deadlineAt,
    }
    return await casStore.setIfAbsent(
      offerKey(input.wacid),
      record,
      remainingTtlMs(input.deadlineAt),
    )
  }

  /**
   * The webhook-boundary entry point for a VoIP-mode connect:
   * writes the offer to short-TTL Redis, then enqueues BOTH the slim
   * `handleConnect` signaling job AND the durable `expireIfUnanswered` job
   * — the SDP never reaches either. Scheduling the expiry here,
   * at the boundary, rather than at the end of the `handleConnect` consumer,
   * decouples deadline enforcement from that consumer succeeding: a
   * `handleConnect` that keeps failing (e.g. the call row created by the slow
   * shared queue isn't ready yet) can never leave the call without a deadline.
   * Deterministic `jobId`s make a Meta redelivery of the same connect event a
   * dedup no-op on the queue side, on top of `storeOffer`'s `SET NX`
   * immutability and the early-return above.
   */
  async captureConnectOffer(input: CaptureConnectOfferInput): Promise<void> {
    const deadlineAt = Date.now() + VOIP_ANSWER_DEADLINE_MS
    const created = await this.storeOffer({
      wacid: input.wacid,
      sdp: input.sdp,
      deadlineAt,
    })
    if (!created) {
      // Redelivered connect webhook for the same wacid within the offer's
      // TTL: the first offer and its immutable deadline stand, and a signaling
      // job is already in flight for it. Re-enqueuing here would re-ring the
      // agent and reset the deadline off a fresh `now`, so stop.
      return
    }
    // The offer key is now claimed (SET NX), so a later redelivery early-returns
    // above and will NOT retry the enqueue. If either enqueue throws (transient
    // Redis/BullMQ error), that would strand the call — offer stored but never
    // rung and never expired. So release the claim on failure: the next Meta
    // redelivery then re-stores the offer and re-enqueues cleanly.
    try {
      await this.enqueueHandleConnect(
        input.wacid,
        deadlineAt,
        input.phoneNumberId,
      )
      await whatsappVoipSignalingQueue.add(
        WhatsappVoipSignalingJobAction.expireIfUnanswered,
        {
          type: WhatsappVoipSignalingJobAction.expireIfUnanswered,
          data: {
            wacid: input.wacid,
            deadlineAt,
            phoneNumberId: input.phoneNumberId,
          },
        },
        {
          jobId: whatsappVoipExpiryJobId(input.wacid),
          delay: Math.max(deadlineAt - Date.now(), 0),
          ...WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
        },
      )
    } catch (error) {
      await this.deleteOffer(input.wacid)
      throw error
    }
  }

  /**
   * A VoIP-mode connect whose inline SDP was malformed/oversized (see
   * `parseCallSession`): enqueue the signaling job WITHOUT storing an offer, so
   * the consumer reads no offer and Meta-`reject`s the call. Never dropped into
   * the SIP path, which has no leg for a VoIP call. No expiry job is scheduled
   * — there is nothing to wait for.
   */
  async rejectUnprocessableConnect(input: {
    wacid: string
    phoneNumberId: string
  }): Promise<void> {
    await this.enqueueHandleConnect(
      input.wacid,
      Date.now() + VOIP_ANSWER_DEADLINE_MS,
      input.phoneNumberId,
    )
  }

  /** Enqueues the slim (SDP-free) `handleConnect` signaling job, replay-safe by deterministic id. */
  private async enqueueHandleConnect(
    wacid: string,
    deadlineAt: number,
    phoneNumberId: string,
  ): Promise<void> {
    await whatsappVoipSignalingQueue.add(
      WhatsappVoipSignalingJobAction.handleConnect,
      {
        type: WhatsappVoipSignalingJobAction.handleConnect,
        data: { wacid, deadlineAt, phoneNumberId },
      },
      {
        jobId: whatsappVoipSignalingJobId(wacid),
        ...WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
      },
    )
  }

  async readOffer(wacid: string): Promise<VoipOfferRecord | null> {
    return await casStore.getJson<VoipOfferRecord>(offerKey(wacid))
  }

  async deleteOffer(wacid: string): Promise<void> {
    await casStore.del(offerKey(wacid))
  }

  async readControl(wacid: string): Promise<VoipCallControl | null> {
    return await casStore.getJson<VoipCallControl>(controlKey(wacid))
  }

  /**
   * Re-discovers a still-ringing, still-unclaimed VoIP call for `workspaceId`
   * so an agent who refreshed their browser (F5) mid-ring can re-show the
   * incoming-call UI — the one-shot realtime ring event is otherwise gone
   * once the socket reconnects, even though the Redis offer/control TTL
   * (~55s) means the call may still be answerable.
   *
   * The DB query (`findRingingByWorkspace`) is only a coarse prefilter;
   * membership in the ring-all/unclaimed state is decided here, against
   * Redis, which stays the single source of truth: a row qualifies only when
   * its control record exists, is still `phase: "reserved"` with
   * `reservedUserId: ""` (nobody has claimed it — a claimed call is being
   * answered by someone else and must not be re-shown), AND its offer is
   * still present. Returns the FIRST such row (bounded by the repository's
   * small `limit`, so this does at most that many Redis reads), or `null`
   * when none qualify.
   */
  async getResumableIncoming(input: {
    workspaceId: string
  }): Promise<ResumableIncomingVoipCall | null> {
    const candidates = await whatsappCallRepository.findRingingByWorkspace(
      input.workspaceId,
    )

    for (const call of candidates) {
      if (!call.wacid) {
        continue
      }
      const [control, offer] = await Promise.all([
        this.readControl(call.wacid),
        this.readOffer(call.wacid),
      ])
      if (!control) {
        continue
      }
      if (control.phase !== "reserved" || control.reservedUserId !== "") {
        continue
      }
      if (!offer) {
        continue
      }

      return {
        whatsappCallId: call.id,
        wacid: call.wacid,
        conversationId: call.conversationId,
        contactInboxId: call.contactInboxId,
        contactName: await resolveWhatsappCallerName(call),
        offer: { sdpType: "offer", sdp: offer.sdp },
        deadlineAt: new Date(control.deadlineAt).toISOString(),
      }
    }

    return null
  }

  /**
   * Resolves the agents to RING for an inbound VoIP call and creates the
   * single (unclaimed) control record — the ring-all analogue of the SIP
   * fork-dial. Ring targets come from {@link whatsappVoipPresenceService}
   * (agents with the inbox open), deliberately NOT SIP `REGISTER` presence, so
   * a VoIP-only number still routes. The control is created once via `SET NX`
   * with `reservedUserId: ""` (nobody has claimed it yet); the first agent to
   * `claimForAnswer` stamps themselves as the winner. A redelivered/retried
   * connect for a still-ringing call re-delivers to the current live set (the
   * browser store is idempotent per wacid); one that already advanced past
   * `reserved` is `alreadyProgressed`.
   */
  async resolveRingTargets(
    input: ResolveRingTargetsInput,
  ): Promise<ResolveRingTargetsResult> {
    const key = controlKey(input.wacid)
    const existing = await casStore.getJson<VoipCallControl>(key)
    if (existing) {
      if (existing.phase !== "reserved") {
        return { status: "alreadyProgressed" }
      }
      // Still ringing (redelivered/retried connect): re-deliver to whoever is
      // live NOW. If everyone has since left, reject — same as the fresh-call
      // branch below, never leave it ringing an empty set.
      const liveTargets = await whatsappVoipPresenceService.liveAgents({
        workspaceId: input.workspaceId,
      })
      return liveTargets.length === 0
        ? { status: "noEligibleAgent" }
        : { status: "ring", targets: liveTargets }
    }

    const targets = await whatsappVoipPresenceService.liveAgents({
      workspaceId: input.workspaceId,
    })
    if (targets.length === 0) {
      return { status: "noEligibleAgent" }
    }

    const control: VoipCallControl = {
      reservedUserId: "",
      phase: "reserved",
      deadlineAt: input.deadlineAt,
      fenceToken: crypto.randomUUID(),
    }
    const created = await casStore.setIfAbsent(
      key,
      control,
      remainingTtlMs(input.deadlineAt),
    )
    if (created) {
      return { status: "ring", targets }
    }

    // Lost a concurrent race to create the control — defer to whoever won.
    const winner = await casStore.getJson<VoipCallControl>(key)
    return winner && winner.phase === "reserved"
      ? { status: "ring", targets }
      : { status: "alreadyProgressed" }
  }

  /**
   * `reserved -> answering`, claiming the call for `userId`. Ring-all: the
   * control starts UNCLAIMED (`reservedUserId: ""`), so the first eligible
   * agent to call this wins and stamps themselves as the answerer; every later
   * caller reads `phase:"answering"` and loses. Atomic: the CAS's `expected`
   * snapshot is checked against the CURRENT Redis value inside a single Lua
   * call, so two simultaneous answerers cannot both win. Returns the fence
   * token on success (threaded through `pre_accept`/`accept` to
   * `commitAccepted`), `null` otherwise.
   */
  async claimForAnswer(input: {
    wacid: string
    userId: string
  }): Promise<string | null> {
    const key = controlKey(input.wacid)
    const current = await casStore.getJson<VoipCallControl>(key)
    // Claimable only while still UNCLAIMED and ringing: once anyone claims it,
    // `phase` leaves `reserved` (so the transition check fails) AND
    // `reservedUserId` is stamped — a second claimer, including a retry by the
    // same agent, correctly loses.
    const claimable =
      current !== null &&
      current.reservedUserId === "" &&
      isTransitionAllowed(current.phase, "answering")
    if (!(current && claimable)) {
      return null
    }

    const next: VoipCallControl = {
      ...current,
      phase: "answering",
      reservedUserId: input.userId,
    }
    const applied = await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      remainingTtlMs(current.deadlineAt),
    )
    return applied ? current.fenceToken : null
  }

  /**
   * `answering -> accepted`, fenced by `fenceToken` — only the CAS that
   * still matches BOTH `phase:"answering"` and the exact fence issued at
   * reservation can win. An `endCall` that lands first (e.g. Meta
   * `terminate` racing the browser's `accept`) always beats this, because
   * this CAS is checked against Redis's live value, not a cached read.
   */
  async commitAccepted(input: {
    wacid: string
    fenceToken: string
  }): Promise<boolean> {
    const key = controlKey(input.wacid)
    const current = await casStore.getJson<VoipCallControl>(key)
    if (
      !current ||
      current.fenceToken !== input.fenceToken ||
      !isTransitionAllowed(current.phase, "accepted")
    ) {
      return false
    }

    const next: VoipCallControl = { ...current, phase: "accepted" }
    return await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      ACTIVE_CALL_CONTROL_TTL_MS,
    )
  }

  /**
   * R6 liveness: the browser tab holding an `accepted` call calls this on a
   * short interval (mirroring the presence heartbeat cadence) so a genuinely
   * stranded call (terminate webhook lost) can later be told apart from one
   * that is still live but has run longer than
   * {@link ACTIVE_CALL_CONTROL_TTL_MS}. Verifies the call belongs to
   * `input.workspaceId` and that the live control is still `phase:"accepted"`
   * with `reservedUserId` matching `input.userId` (the agent who won
   * `claimForAnswer`/holds `startOutboundDial`'s initiator slot) before doing
   * anything — a heartbeat for a call this agent doesn't own, or that already
   * ended, is a no-op (`false`).
   *
   * On success it renews the control's TTL with a fenced CAS
   * (`phase:"accepted"` + the exact `fenceToken`), so a call kept alive past
   * {@link ACTIVE_CALL_CONTROL_TTL_MS} keeps an authenticated hangup path. The
   * CAS losing (a concurrent hangup/terminate) never turns this into a
   * failure. It ALSO refreshes the DB row's durable liveness — the only signal
   * {@link WhatsappVoipCallService.recoverStrandedAcceptedCall} trusts.
   */
  async heartbeatActiveCall(input: {
    wacid: string
    workspaceId: string
    userId: string
  }): Promise<boolean> {
    const call = await whatsappCallRepository.findByWacid(input.wacid)
    if (!call || call.workspaceId !== input.workspaceId) {
      return false
    }

    const control = await this.readControl(input.wacid)
    if (!control) {
      // Redis lost the control (flush/eviction/restart) while the call is
      // still up. The DB row is the durable authority here: an `accepted`
      // row owned by this agent means the call IS live, so keep refreshing
      // its liveness (and keep the client heartbeating) rather than letting a
      // later dial treat it as stranded. There is no control to renew.
      const ownsLiveCall =
        call.status === "accepted" &&
        (call.answeredByUserId === input.userId ||
          call.initiatedByUserId === input.userId)
      if (!ownsLiveCall) {
        return false
      }
      await this.touchCallLiveness(call.id)
      return true
    }
    if (
      control.phase !== "accepted" ||
      control.reservedUserId !== input.userId
    ) {
      return false
    }

    await casStore
      .compareAndSwap<VoipCallControl>(
        controlKey(input.wacid),
        { phase: "accepted", fenceToken: control.fenceToken },
        control,
        ACTIVE_CALL_CONTROL_TTL_MS,
      )
      .catch((error: unknown) => {
        logger.warn(
          { err: error, wacid: input.wacid },
          "WhatsApp VoIP active-call heartbeat: control renewal failed",
        )
      })

    await this.touchCallLiveness(call.id)

    return true
  }

  /**
   * Durable liveness: recovery reads the row's `updatedAt`, which no Redis
   * outage can erase. The throttle is the DB's own WHERE clause (a write only
   * lands when the row is older than the interval), so it cannot be defeated
   * by a Redis value that refreshes on every beat. Never throws — a failed
   * touch only risks the row looking older than it is, and it takes
   * {@link ACTIVE_CALL_LIVENESS_STALE_MS} of consecutive failures plus a
   * deliberate re-dial before that matters.
   */
  private async touchCallLiveness(whatsappCallId: string): Promise<void> {
    await whatsappCallRepository
      .touchLivenessIfStale({
        id: whatsappCallId,
        olderThan: new Date(Date.now() - ACTIVE_CALL_ROW_TOUCH_INTERVAL_MS),
      })
      .catch((error: unknown) => {
        logger.warn(
          { err: error, whatsappCallId },
          "WhatsApp VoIP active-call heartbeat: durable liveness touch failed",
        )
      })
  }

  /**
   * The single termination primitive — every end-of-call path (reject,
   * hangup, expiry cleanup, finalize) routes through it, so the phase → Graph
   * action mapping lives in exactly one place. Advances to `terminated` from
   * any non-final phase (per {@link ALLOWED_TRANSITIONS}) and reports the
   * phase it terminated FROM plus the Graph action Meta expects for it, so no
   * caller hard-codes `reject` vs `terminate`.
   *
   * Because the CAS is checked against Redis's live value, a termination that
   * wins is permanent: a subsequent `commitAccepted` CAS (which requires
   * `phase:"answering"`) will observe `phase:"terminated"` and lose. Returns
   * `null` when there is nothing to terminate — no control record, an
   * already-final phase, `accepted` while `allowFromAccepted` is `false`, or a
   * lost CAS race — so the caller treats "already ended" as a no-op success.
   */
  async endCall(input: EndVoipCallInput): Promise<EndVoipCallResult | null> {
    const key = controlKey(input.wacid)
    const current = await casStore.getJson<VoipCallControl>(key)
    if (!(current && isTransitionAllowed(current.phase, "terminated"))) {
      return null
    }
    if (current.phase === "accepted" && !input.allowFromAccepted) {
      return null
    }

    const next: VoipCallControl = { ...current, phase: "terminated" }
    const applied = await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      TERMINATED_CONTROL_TTL_MS,
    )
    if (!applied) {
      return null
    }
    // `current.phase` here is always one of the 3 terminable phases: the
    // `isTransitionAllowed(current.phase, "terminated")` guard above already
    // excludes `terminated`, and `VoipCallPhase` has no other members.
    if (!isTerminableVoipCallPhase(current.phase)) {
      return null
    }
    return {
      fromPhase: current.phase,
      ...VOIP_END_OUTCOME_BY_PHASE[current.phase],
    }
  }

  /**
   * Fenced rollback `answering -> reserved`, deliberately reversing the
   * `claimForAnswer` transition. Used after a Graph accept attempt fails
   * (e.g. Meta's `accept` call rejects, or the browser's WebRTC negotiation
   * never completes) so the call can be re-answered within its original
   * deadline instead of being stuck `answering` forever or terminated
   * outright:
   *
   * - Other rung agents can `claimForAnswer` again once the control is back
   *   to `reserved`/`reservedUserId:""`.
   * - An agent who refreshed their browser mid-attempt is picked back up by
   *   {@link WhatsappVoipCallService.getResumableIncoming}, which requires
   *   exactly `phase:"reserved"` + `reservedUserId:""`.
   *
   * This does NOT loosen {@link ALLOWED_TRANSITIONS}/{@link
   * isTransitionAllowed} — that table stays forward-only (`reserved ->
   * answering -> accepted -> terminated`) for every other caller. Loosening
   * it globally to allow `answering -> reserved` would let unrelated code
   * paths perform this same rollback without the fence + phase guard below,
   * silently re-opening a call whose Graph accept actually succeeded. So this
   * method performs its own explicit, narrowly-guarded CAS instead of
   * routing through `isTransitionAllowed`.
   *
   * Fenced: applies ONLY when the live control is still `phase:"answering"`
   * AND its `fenceToken` matches `input.fenceToken` — the exact token minted
   * for THIS answer attempt, so a stale/duplicate call from a slow retry can
   * never roll back a different (later) claim. `deadlineAt` and `fenceToken`
   * are preserved unchanged; only `phase` and `reservedUserId` revert.
   *
   * Returns `true` when the rollback wins the CAS, `false` for every other
   * outcome (no control record, wrong phase, fence mismatch, or a lost CAS
   * race against a concurrent `commitAccepted`/`endCall`).
   */
  async releaseClaim(input: {
    wacid: string
    fenceToken: string
  }): Promise<boolean> {
    const key = controlKey(input.wacid)
    const current = await casStore.getJson<VoipCallControl>(key)
    if (
      current?.phase !== "answering" ||
      current.fenceToken !== input.fenceToken
    ) {
      return false
    }

    const next: VoipCallControl = {
      ...current,
      phase: "reserved",
      reservedUserId: "",
    }
    return await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      remainingTtlMs(current.deadlineAt),
    )
  }

  /**
   * Creates the outbound (business-initiated) call control, keyed by
   * `wacid` in the SAME `voip:ctrl:<wacid>` namespace inbound calls use —
   * called by the app layer AFTER `connectCall` returns Meta's `wacid`, so
   * (unlike the inbound `resolveRingTargets` control, which exists before
   * the caller is known) there is exactly one agent from the start:
   * `reservedUserId` is the initiator, never `""`. `SET NX` makes this
   * create-only — a retry of the same dial (same wacid) is a no-op that
   * reports `null` rather than resetting an in-flight control.
   *
   * The control TTL includes {@link OUTBOUND_CONTROL_TTL_MARGIN_MS} so
   * it outlives its own `expireOutboundDial` job, which is scheduled with a
   * delay derived from the SAME `deadlineAt` — without the margin, the
   * control would already be gone by the time that job runs.
   *
   * L3 fix: an action stall between `connectCall` returning and this call
   * running can let Meta's ACCEPTED status land first — `markOutboundAccepted`
   * no-ops against a control that doesn't exist yet, and the DB row is
   * already `accepted`. Reading the row's status here first and starting the
   * control in phase `accepted` (with the long-lived active-call TTL) in
   * that case keeps the expiry job from later killing an already-live call.
   */
  async startOutboundDial(
    input: StartOutboundDialInput,
  ): Promise<VoipCallControl | null> {
    const existingCall = await whatsappCallRepository.findByWacid(input.wacid)
    const phase: VoipCallPhase =
      existingCall?.status === "accepted" ? "accepted" : "dialing"

    const control: VoipCallControl = {
      reservedUserId: input.initiatorUserId,
      phase,
      direction: "businessInitiated",
      deadlineAt: input.deadlineAt,
      fenceToken: crypto.randomUUID(),
    }
    const ttl =
      phase === "accepted"
        ? ACTIVE_CALL_CONTROL_TTL_MS
        : remainingTtlMs(input.deadlineAt) + OUTBOUND_CONTROL_TTL_MARGIN_MS
    const created = await casStore.setIfAbsent(
      controlKey(input.wacid),
      control,
      ttl,
    )
    return created ? control : null
  }

  /**
   * `dialing -> ringing`, best-effort (Meta's RINGING status webhook may
   * never arrive, or may arrive after ACCEPTED — ordering is not
   * guaranteed). Returns `false` without error when the control is not in
   * `dialing` (already advanced, already terminated, or missing) — the
   * caller treats this purely as an observability/UI advance, never a
   * blocking precondition.
   */
  async markOutboundRinging(input: { wacid: string }): Promise<boolean> {
    const key = controlKey(input.wacid)
    const current = await casStore.getJson<VoipCallControl>(key)
    if (!(current && isTransitionAllowed(current.phase, "ringing"))) {
      return false
    }

    const next: VoipCallControl = { ...current, phase: "ringing" }
    return await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      remainingTtlMs(current.deadlineAt),
    )
  }

  /**
   * `dialing|ringing -> accepted`, best-effort. This only advances the
   * CONTROL so `endCall` routes a later hangup through the `accepted` →
   * `terminate`/`completed` outcome instead of `dialing`/`ringing` →
   * `failed`; `whatsappCallRepository.markAcceptedIfActive` remains the
   * single authoritative writer of the DB row's `accepted` status.
   */
  async markOutboundAccepted(input: { wacid: string }): Promise<boolean> {
    const key = controlKey(input.wacid)
    const current = await casStore.getJson<VoipCallControl>(key)
    if (
      !current ||
      (current.phase !== "dialing" && current.phase !== "ringing") ||
      !isTransitionAllowed(current.phase, "accepted")
    ) {
      return false
    }

    const next: VoipCallControl = { ...current, phase: "accepted" }
    return await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      ACTIVE_CALL_CONTROL_TTL_MS,
    )
  }

  /**
   * Immutable first-seen SDP ANSWER store for an outbound call: `SET NX
   * PX`, keyed by `attemptId` (the only id known before Meta returns a
   * `wacid`) — the answer-direction counterpart of `storeOffer`. The SDP
   * never enters a BullMQ payload; this Redis handoff is the only path from
   * the answer webhook to the signaling consumer. Returns whether THIS call
   * created the record (`false` means a redelivery).
   */
  async storeOutboundAnswer(input: StoreOutboundAnswerInput): Promise<boolean> {
    const record: VoipOutboundAnswerRecord = { sdp: input.sdp }
    return await casStore.setIfAbsent(
      outboundAnswerKey(input.attemptId),
      record,
      VOIP_ANSWER_DEADLINE_MS,
    )
  }

  async readOutboundAnswer(attemptId: string): Promise<{ sdp: string } | null> {
    return await casStore.getJson<VoipOutboundAnswerRecord>(
      outboundAnswerKey(attemptId),
    )
  }

  async deleteOutboundAnswer(attemptId: string): Promise<void> {
    await casStore.del(outboundAnswerKey(attemptId))
  }

  /**
   * The webhook-boundary entry point for a BUSINESS_INITIATED `connect`
   * event's answer: resolves the pending `WhatsappCall` row — created
   * pre-dial, so it always exists by the time Meta's answer arrives —
   * stores the SDP in short-TTL Redis (never a BullMQ payload), then
   * enqueues the slim `handleOutboundAnswer` signaling job with a
   * deterministic `jobId` so a webhook redelivery dedups. Never throws into
   * the webhook: a row that can't be resolved is logged and dropped, since
   * there is nobody to forward the answer to.
   */
  async captureOutboundAnswer(
    input: CaptureOutboundAnswerInput,
  ): Promise<void> {
    const row = input.attemptId
      ? await whatsappCallRepository.findByAttemptId(input.attemptId)
      : undefined
    const resolved =
      row ?? (await whatsappCallRepository.findByWacid(input.wacid))
    if (!resolved) {
      logger.warn(
        { attemptId: input.attemptId, wacid: input.wacid },
        "Whatsapp outbound answer: no matching call row found; dropping",
      )
      return
    }

    // The row's own `attemptId` is authoritative (it was minted at dial
    // time and echoed to Meta as `biz_opaque_callback_data`) — prefer it
    // over the caller's input, which may be "" on the wacid-fallback path.
    const attemptId = resolved.attemptId || input.attemptId
    if (!attemptId) {
      logger.warn(
        { wacid: input.wacid, whatsappCallId: resolved.id },
        "Whatsapp outbound answer: resolved call row has no attemptId; cannot store/enqueue the answer",
      )
      return
    }

    const created = await this.storeOutboundAnswer({
      attemptId,
      sdp: input.sdp,
    })
    if (!created) {
      // Redelivered answer webhook for the same attemptId: the first answer
      // stands, and a signaling job is already in flight for it.
      return
    }
    try {
      await this.enqueueHandleOutboundAnswer({
        attemptId,
        whatsappCallId: resolved.id,
        wacid: input.wacid || resolved.wacid || undefined,
        workspaceId: resolved.workspaceId,
      })
    } catch (error) {
      await this.deleteOutboundAnswer(attemptId)
      throw error
    }
  }

  /** Enqueues the slim (SDP-free) `handleOutboundAnswer` signaling job, replay-safe by deterministic id. */
  private async enqueueHandleOutboundAnswer(input: {
    attemptId: string
    whatsappCallId: string
    wacid?: string
    workspaceId: string
  }): Promise<void> {
    await whatsappVoipSignalingQueue.add(
      WhatsappVoipSignalingJobAction.handleOutboundAnswer,
      {
        type: WhatsappVoipSignalingJobAction.handleOutboundAnswer,
        data: {
          attemptId: input.attemptId,
          whatsappCallId: input.whatsappCallId,
          wacid: input.wacid,
          workspaceId: input.workspaceId,
        },
      },
      {
        jobId: outboundAnswerJobId(input.attemptId),
        ...WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
      },
    )
  }

  /**
   * The webhook-boundary entry point for a Meta-native
   * `call_recording_available` event (VoIP-only — see
   * : resolves the
   * `WhatsappCall` row by `wacid` and enqueues the slim (media
   * id/url/mime-type only, never the audio bytes)
   * `whatsappCallNativeRecordingFetch` job, deterministically keyed by
   * `wacid` so a Meta webhook redelivery dedups on the queue side. Never
   * throws into the webhook: a row that can't be resolved (e.g. the call was
   * purged, or the webhook arrived before the row existed) is logged and
   * dropped rather than failing the whole webhook delivery.
   */
  async captureNativeRecordingAvailable(
    input: CaptureNativeRecordingAvailableInput,
  ): Promise<void> {
    const row = await whatsappCallRepository.findByWacid(input.wacid)
    if (row) {
      logger.info(
        {
          wacid: input.wacid,
          whatsappCallId: row.id,
          workspaceId: row.workspaceId,
        },
        "[wa-call-recording] matched call row → enqueuing native fetch job",
      )
    } else {
      // R8: never drop the event because the row hasn't been created yet —
      // the recording webhook can race the row-creating `calls`
      // webhook/job. Enqueue anyway; the fetch job resolves the row by
      // `wacid` with bounded retry/backoff instead.
      logger.warn(
        { wacid: input.wacid },
        "[wa-call-recording] no matching call row for wacid yet; enqueuing native fetch job to retry by wacid",
      )
    }

    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.whatsappCallNativeRecordingFetch,
        data: {
          ...(row === undefined
            ? {}
            : { whatsappCallId: row.id, workspaceId: row.workspaceId }),
          wacid: input.wacid,
          audioMediaId: input.audioMediaId,
          audioUrl: input.audioUrl,
          mimeType: input.mimeType,
        },
      },
      { jobId: whatsappCallNativeRecordingFetchJobId(input.wacid) },
    )
  }

  /**
   * The webhook-boundary entry point for a Meta-native
   * `call_transcription_available` event (VoIP-only — see
   * , the
   * transcript-direction counterpart of
   * {@link captureNativeRecordingAvailable}: resolves the `WhatsappCall` row
   * by `wacid` and enqueues the slim `whatsappCallNativeTranscriptFetch` job
   * (document id/url only, never the transcript body), deterministically
   * keyed by `wacid`. Never throws into the webhook: no matching row is
   * logged and dropped.
   */
  async captureNativeTranscriptAvailable(
    input: CaptureNativeTranscriptAvailableInput,
  ): Promise<void> {
    const row = await whatsappCallRepository.findByWacid(input.wacid)
    if (!row) {
      // R8: never drop the event because the row hasn't been created yet —
      // enqueue anyway; the fetch job resolves the row by `wacid` with
      // bounded retry/backoff instead.
      logger.warn(
        { wacid: input.wacid },
        "Whatsapp native call transcript: no matching call row found yet; enqueuing native fetch job to retry by wacid",
      )
    }

    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.whatsappCallNativeTranscriptFetch,
        data: {
          ...(row === undefined
            ? {}
            : { whatsappCallId: row.id, workspaceId: row.workspaceId }),
          wacid: input.wacid,
          documentMediaId: input.documentMediaId,
          documentUrl: input.documentUrl,
        },
      },
      { jobId: whatsappCallNativeTranscriptFetchJobId(input.wacid) },
    )
  }

  /**
   * Durable deadline enforcement for the outbound dial/accept window
   *, the outbound counterpart of the
   * `expireIfUnanswered` job {@link captureConnectOffer} schedules. Called
   * by the app layer right after `startOutboundDial` succeeds, so a dial
   * that never gets an ACCEPTED status is terminated/finalized on schedule
   * even if every other signal is lost.
   */
  async enqueueOutboundDialExpiry(
    input: EnqueueOutboundDialExpiryInput,
  ): Promise<void> {
    await whatsappVoipSignalingQueue.add(
      WhatsappVoipSignalingJobAction.expireOutboundDial,
      {
        type: WhatsappVoipSignalingJobAction.expireOutboundDial,
        data: {
          attemptId: input.attemptId,
          whatsappCallId: input.whatsappCallId,
          wacid: input.wacid,
          workspaceId: input.workspaceId,
          deadlineAt: input.deadlineAt,
        },
      },
      {
        jobId: expireOutboundDialJobId(input.attemptId),
        delay: Math.max(input.deadlineAt - Date.now(), 0),
        ...WHATSAPP_VOIP_SIGNAL_RETRY_OPTIONS,
      },
    )
  }

  /**
   * The glare guard: throws {@link WhatsappCallInProgressError} when a
   * `ringing`/`accepted` call — either direction — already exists for this
   * contact-inbox. Called by the app layer BEFORE placing a new outbound
   * dial (mirrors Meta's own 138003 "call already ongoing" rejection, but
   * lets us fail fast without an extra Graph round-trip).
   */
  async assertNoActiveCallForContact(input: {
    inboxId: string
    contactInboxId: string
  }): Promise<void> {
    const active = await whatsappCallRepository.findActiveByContactInbox({
      inboxId: input.inboxId,
      contactInboxId: input.contactInboxId,
    })
    if (!active) {
      return
    }
    if (await this.recoverStrandedAcceptedCall(active)) {
      return
    }
    throw new WhatsappCallInProgressError(input.contactInboxId)
  }

  /**
   * Dial-time recovery for a call left `accepted` forever because its
   * `terminate` webhook never arrived: that row holds the
   * one-live-call-per-contact guard (and the partial unique index behind it),
   * so without this the contact could never be called again.
   *
   * Deliberately NOT a background sweep. "No heartbeat" is evidence, never
   * proof, that a call ended — a suspended tab or a browser that can still
   * reach Meta's relay but not ChatbotX looks identical — so nothing closes a
   * call on a timer. This runs only when an agent explicitly dials the same
   * contact again, which is itself the human confirmation that the old call is
   * over, and it never touches Meta (a call whose media really stopped is
   * dropped by Meta itself, errors 138021/138022).
   *
   * Three guards, all of which must agree: the row is `accepted`, its Redis
   * control is gone or already terminated, and it has had no liveness
   * heartbeat for {@link ACTIVE_CALL_LIVENESS_STALE_MS}. The last two of those
   * happen as ONE conditional UPDATE
   * ({@link WhatsappCallRepository.recoverStrandedAccepted}) rather than a
   * claim followed by a finalize: a claim would bump `updatedAt` itself, so in
   * the gap before the finalize a heartbeat could no longer prove the call is
   * live and a live call could be closed. Written as one statement there is no
   * gap, and a concurrent heartbeat simply makes the UPDATE match nothing.
   *
   * Returns true only when this call personally made the transition, or when a
   * re-read shows the row reached a terminal status by itself while we were
   * looking (a real `terminate` landing in the same instant) — which equally
   * means the contact is free. Anything else refuses the dial.
   *
   * The recovered row is `completed`, not `failed`: reaching `accepted` means
   * the call did connect. `durationSeconds` and `endedAt` stay null rather
   * than guessed — we know the call is over, never when it ended, and a
   * delayed terminate can still fill them in. No activity card, realtime event
   * or workflow trigger is emitted — those belong to an authoritative terminate, and
   * inventing them here is exactly the false-terminal-effect problem that
   * removed the background sweep.
   */
  private async recoverStrandedAcceptedCall(
    call: WhatsappCallModel,
  ): Promise<boolean> {
    if (call.status !== "accepted") {
      return false
    }
    if (call.wacid) {
      const control = await this.readControl(call.wacid)
      if (control && control.phase !== "terminated") {
        return false
      }
    }

    const recovered = await whatsappCallRepository.recoverStrandedAccepted({
      id: call.id,
      olderThan: new Date(Date.now() - ACTIVE_CALL_LIVENESS_STALE_MS),
      lastError: STRANDED_CALL_RECOVERED_LAST_ERROR,
    })
    if (recovered) {
      logger.info(
        { whatsappCallId: call.id, wacid: call.wacid },
        "WhatsApp call: closed a stranded accepted call so this contact can be dialed again",
      )
      return true
    }

    // Lost the conditional update. Either a heartbeat proved the call live
    // (row still `accepted`, refuse) or a real terminate beat us to it (row
    // already terminal, so the contact is free after all).
    const latest = await whatsappCallRepository.findById(call.id)
    return !(
      latest &&
      (latest.status === "accepted" || latest.status === "ringing")
    )
  }

  /**
   * Inserts the call row for an outbound attempt before the dial is placed.
   * The agent is recorded as both the initiator and the answering party, so
   * Meta's asynchronous answer webhook can be routed back to them and the
   * recording-upload route's ownership check passes.
   *
   * Propagates {@link WhatsappCallPendingOutboundExistsError} when the
   * one-live-attempt-per-contact index is already held, which the caller
   * reports as "call already in progress" rather than dialing a second leg.
   */
  async createOutboundAttempt(input: {
    attemptId: string
    workspaceId: string
    inboxId: string
    contactInboxId: string
    conversationId: string
    agentUserId: string
  }): Promise<WhatsappCallModel> {
    return await whatsappCallRepository.createPendingOutbound({
      attemptId: input.attemptId,
      workspaceId: input.workspaceId,
      inboxId: input.inboxId,
      contactInboxId: input.contactInboxId,
      conversationId: input.conversationId,
      answeredByUserId: input.agentUserId,
      initiatedByUserId: input.agentUserId,
    })
  }

  /**
   * How to end a live call that has no control record, derived from its row
   * exactly as {@link WhatsappVoipCallService.endCall} derives it from the
   * control phase. `null` when the row is already terminal.
   */
  resolveEndOutcomeWithoutControl(
    call: Pick<WhatsappCallModel, "status" | "direction">,
  ): EndVoipCallResult | null {
    const phase = LIVE_CALL_PHASE_BY_STATUS[call.status]?.[call.direction]
    return phase
      ? { fromPhase: phase, ...VOIP_END_OUTCOME_BY_PHASE[phase] }
      : null
  }

  /** True once the call row has reached a status nothing can move it out of. */
  isCallEnded(call: Pick<WhatsappCallModel, "status">): boolean {
    return WHATSAPP_CALL_TERMINAL_STATUSES.includes(call.status)
  }

  /**
   * Binds Meta's call id to the row an outbound attempt created, once the
   * dial returns one. Idempotent, and it reconciles the attempt row with a
   * row a webhook may have created for the same call in the meantime.
   * Resolves to the bound row, or `undefined` when the attempt row is gone.
   */
  async attachMetaCallId(input: {
    whatsappCallId: string
    wacid: string
  }): Promise<WhatsappCallModel | undefined> {
    return await whatsappCallRepository.attachWacid({
      id: input.whatsappCallId,
      wacid: input.wacid,
    })
  }

  /**
   * Persists acceptance for the agent who won the claim, after Meta has
   * confirmed the accept. Returns `false` when the row had already reached a
   * terminal status, which means a concurrent hangup/terminate finished the
   * call first and the caller must compensate instead of treating it as
   * answered — the guarded UPDATE never resurrects a terminal row.
   */
  async markAcceptedByAgent(input: {
    whatsappCallId: string
    agentUserId: string
  }): Promise<boolean> {
    const accepted = await whatsappCallRepository.markAcceptedIfActive({
      id: input.whatsappCallId,
      answeredByUserId: input.agentUserId,
    })
    return Boolean(accepted)
  }

  /**
   * Writes a call's terminal status and outcome — from an agent hangup, a
   * Meta terminate webhook, or the stale-ringing sweep. The repository's
   * status-rank guard never downgrades a terminal row and only fills fields
   * still missing on a same-status redelivery, so every caller is idempotent.
   * Omitted (`undefined`) fields are left untouched. Resolves to the written
   * row, or `undefined` when nothing changed.
   */
  async finalizeEndedCall(input: {
    whatsappCallId: string
    status: WhatsappCallStatus
    endedAt: Date
    startedAt?: Date | null
    durationSeconds?: number | null
    messageId?: string | null
    lastError?: string | null
    current?: WhatsappCallModel
  }): Promise<WhatsappCallModel | undefined> {
    const { whatsappCallId, ...finalization } = input
    return await whatsappCallRepository.finalizeById({
      id: whatsappCallId,
      ...finalization,
    })
  }
}

export const whatsappVoipCallService = new WhatsappVoipCallService()
