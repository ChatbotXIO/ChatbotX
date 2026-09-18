import type { WhatsappCallTerminalStatusOutcomePair } from "@chatbotx.io/database/partials"
import {
  WHATSAPP_CALL_TERMINAL_STATUSES,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { casStore } from "@chatbotx.io/redis"
import { contactService } from "../contact/service"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { inboxTeamService } from "../enterprise/inbox-team/service"
import { logger } from "../logger"
import { workspaceMemberService } from "../workspace-member/service"
import { workspacePresenceService } from "../workspace-presence/service"
import {
  canCallConversationForMember,
  loadCallEligibilityMember,
} from "./call-access-service"
import {
  type RingContext,
  type RingMember,
  type RingTargetsSelection,
  selectRingTargets,
} from "./ring-targets"
import {
  ACTIVE_CALL_CONTROL_TTL_MS,
  ACTIVE_CALL_LIVENESS_STALE_MS,
  ACTIVE_CALL_ROW_TOUCH_INTERVAL_MS,
  ALLOWED_TRANSITIONS,
  controlKey,
  type EndVoipCallInput,
  type EndVoipCallResult,
  isTerminableVoipCallPhase,
  isTransitionAllowed,
  LIVE_CALL_PHASE_BY_STATUS,
  remainingTtlMs,
  STRANDED_CALL_RECOVERED_LAST_ERROR,
  TERMINATED_CONTROL_TTL_MS,
  VOIP_CONTROL_EXPIRY_MARGIN_MS,
  VOIP_END_OUTCOME_BY_PHASE,
  type VoipCallControl,
  type VoipCallPhase,
} from "./voip-call-control"
import { whatsappVoipSignalingService } from "./voip-signaling-service"

export { MAX_VOIP_RING_TARGETS } from "./ring-targets"

export type ReserveIncomingCallInput = {
  wacid: string
  deadlineAt: number
}
/**
 * Discriminated so `handleConnect` can tell the two outcomes apart:
 * - `reserved` — a `phase:"reserved"` control record exists for this
 *   `wacid` (freshly created by THIS call, OR already there from an
 *   earlier reservation — e.g. a redelivered/retried connect for a call
 *   still ringing). Either way the caller must now resolve and ring the
 *   live target set.
 * - `alreadyProgressed` — a control record exists PAST `reserved` (claimed,
 *   answered, or terminated); the connect handler must NO-OP, never re-ring
 *   and never terminate, so it can't downgrade a live/accepted call.
 */
export type ReserveIncomingCallResult =
  | { status: "reserved" }
  | { status: "alreadyProgressed" }
/**
 * Best-effort caller display name for the ring UI: `contactInbox -> contact
 * -> fullName`. Shared between the worker's realtime ring delivery
 * (`handleConnect`) and the builder's resume-after-refresh lookup
 * (`listResumableIncoming`), so both surfaces resolve a caller's name the
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
 * (`WhatsappVoipIncomingData`) exactly, so each entry of
 * `listResumableIncoming`'s result array can be handed straight to it after
 * an on-mount resume fetch (F5 during still-ringing calls).
 */
export type StartOutboundDialInput = {
  wacid: string
  initiatorUserId: string
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
 * WebRTC): the fenced call-control state machine and the call row's
 * lifecycle writes. The SDP records and webhook entry points belong to
 * {@link whatsappVoipSignalingService}.
 * Pure orchestration over `casStore` (Redis) and existing repositories —
 * never touches `db` directly (see `AGENTS.md` invariant #9) and never
 * persists to Postgres itself (accepted-call persistence is a later phase,
 * via `whatsappCallRepository.markAcceptedIfActive`).
 */
class WhatsappVoipCallService {
  async readControl(wacid: string): Promise<VoipCallControl | null> {
    return await casStore.getJson<VoipCallControl>(controlKey(wacid))
  }

  /**
   * Re-discovers every still-ringing, unclaimed VoIP call for `workspaceId`,
   * so an agent who refreshed mid-ring sees all of them again — ring-all
   * means several callers can be ringing at once, and each one-shot realtime
   * ring event is gone after a reconnect even though the ~55s offer/control
   * TTL may leave the calls answerable.
   *
   * `findRingingByWorkspace` is only a coarse prefilter; Redis decides
   * membership. A row qualifies when its control exists, is still
   * `reserved` with an empty `reservedUserId` (a claimed call is being
   * answered by someone else), and its offer is still there.
   *
   * Every candidate is resolved concurrently in one `Promise.all` — at the
   * repository's limit of 20 that is up to 40 Redis reads plus the name
   * lookups, per resume fetch, and only while calls are actually ringing.
   * The bound is fixed at that limit however busy the workspace gets.
   * `Promise.all` preserves input order, so results stay
   * newest-created-first with unqualified rows simply absent. Returns `[]`,
   * never `null`.
   */
  async listResumableIncoming(input: {
    workspaceId: string
    userId: string
  }): Promise<ResumableIncomingVoipCall[]> {
    // M3 (scale): the caller's ring-eligibility permissions are the SAME
    // for every candidate in this request (one `workspaceId`/`userId`) —
    // load them ONCE here rather than once per candidate inside
    // `resolveResumableCandidate`, so a workspace with N ringing calls
    // fires one permissions read, not N.
    const [candidates, member] = await Promise.all([
      whatsappCallRepository.findRingingByWorkspace(input.workspaceId),
      loadCallEligibilityMember({
        workspaceId: input.workspaceId,
        userId: input.userId,
      }),
    ])

    const resolved = await Promise.all(
      candidates.map((call) => this.resolveResumableCandidate(call, member)),
    )

    return resolved.filter(
      (entry): entry is ResumableIncomingVoipCall => entry !== null,
    )
  }

  /**
   * Per-candidate liveness check backing {@link listResumableIncoming} — kept
   * as the single place the three Redis liveness rules (control exists,
   * `phase: "reserved"` + unclaimed, offer present) are evaluated, so they
   * are never duplicated. Two Redis reads per candidate (`readControl` +
   * `readOffer`), plus one `resolveWhatsappCallerName` (contactInbox ->
   * contact) for a candidate that qualifies. Note this is strictly MORE work
   * than the singular predecessor, which returned at the first qualifying
   * row: the plural contract has to inspect every candidate, so a worst case
   * is `FIND_RINGING_BY_WORKSPACE_LIMIT` (20) x (2 Redis + 1 name lookup),
   * issued concurrently. Accepted because it is hard-bounded by that limit,
   * runs only on an agent's inbox mount, and does nothing at all unless calls
   * are actually ringing right then.
   * Returns `null` for a disqualified candidate rather than throwing, so
   * {@link listResumableIncoming} can run every candidate through
   * `Promise.all` and simply filter the misses.
   *
   * P2 item 5 / M3 (scale): the D3 eligibility check
   * (`canCallConversationForMember`, the same core rule
   * `call-access-service.ts` applies everywhere else, against a member
   * loaded ONCE by the caller — never re-fetched per candidate) runs BEFORE
   * `readOffer`, and only AFTER the cheap control check (control exists,
   * `phase: "reserved"`, unclaimed) — so the offer SDP is read from Redis
   * only for a candidate that is reserved, unclaimed, AND eligible. Neither
   * an ineligible candidate nor a non-reserved/claimed one ever costs an
   * offer read, and a resume request from a member who could not pick up
   * this call never leaks its SDP.
   */
  private async resolveResumableCandidate(
    call: WhatsappCallModel,
    member: RingMember | null,
  ): Promise<ResumableIncomingVoipCall | null> {
    if (!call.wacid) {
      return null
    }
    const control = await this.readControl(call.wacid)
    if (!control) {
      return null
    }
    if (control.phase !== "reserved" || control.reservedUserId !== "") {
      return null
    }

    const allowed = await canCallConversationForMember({
      member,
      workspaceId: call.workspaceId,
      conversationId: call.conversationId,
    })
    if (!allowed) {
      return null
    }

    const offer = await whatsappVoipSignalingService.readOffer(call.wacid)
    if (!offer) {
      return null
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

  /**
   * Claims an inbound call as `terminated` before this worker refuses it —
   * `SET NX`, the SAME primitive {@link
   * WhatsappVoipCallService.reserveIncomingCall} uses to create the ringing
   * control, so exactly one of the two can win the key.
   *
   * Reading the control and then rejecting at Meta is not enough on its own:
   * an agent can claim the call in the gap between the read and the Graph
   * call, and the reject would then drop a live conversation. Claiming first
   * removes the gap in both directions:
   *
   * - We win, so no control existed and none can appear behind us —
   *   `reserveIncomingCall` now reads `terminated`, reports
   *   `alreadyProgressed`, and rings nobody. The Graph reject is safe.
   * - We lose, so a control already exists and the caller must defer to the
   *   fenced CAS in `endCall` instead, which ends a still-`reserved` call and
   *   no-ops on one that has been claimed or answered.
   *
   * The phase written is terminal, so the leftover key is inert: `handleExpire`
   * and a redelivered `connect` both read it and return early, and
   * `listResumableIncoming`/`claimForAnswer` only ever act on `reserved`.
   */
  async claimUnreachable(input: {
    wacid: string
    deadlineAt: number
  }): Promise<boolean> {
    const control: VoipCallControl = {
      reservedUserId: "",
      phase: "terminated",
      deadlineAt: input.deadlineAt,
      fenceToken: crypto.randomUUID(),
    }
    return await casStore.setIfAbsent(
      controlKey(input.wacid),
      control,
      TERMINATED_CONTROL_TTL_MS,
    )
  }

  /**
   * Reserves the single (unclaimed) control record for an inbound VoIP call
   * BEFORE any target selection runs (P2 §4: "reserve-first") — the
   * deadline-owning control exists before any retryable read
   * (`getCallRowOrThrow`'s conversation lookup), so a row-not-ready retry
   * can never leave a call with no control and no deadline enforcement
   * (the P1 stopgap's residual "row never appears -> no control -> nobody
   * rejects" gap). `SET NX` on the control key: the first reservation for
   * a `wacid` creates it with `reservedUserId: ""` (nobody has claimed it
   * yet); every later call — including a redelivered/retried connect for a
   * call still ringing — simply observes the same `reserved` control, and
   * the worker re-runs selection against the CURRENT live set
   * (`selectRingTargetsForCall`). One that already advanced past
   * `reserved` (claimed, answered, terminated) is `alreadyProgressed`.
   *
   * The control TTL includes {@link VOIP_CONTROL_EXPIRY_MARGIN_MS} so it
   * outlives the durable `expireIfUnanswered` job, scheduled (at the webhook
   * boundary, in `captureConnectOffer`) with a delay derived from the SAME
   * `deadlineAt` — without the margin, the control would already be gone by
   * the time that job runs (Bug 1: `handleExpire` reads `null` and silently
   * no-ops, and the call is only ever recovered by the 5-minute stale-call
   * sweep).
   */
  async reserveIncomingCall(
    input: ReserveIncomingCallInput,
  ): Promise<ReserveIncomingCallResult> {
    const key = controlKey(input.wacid)
    const existing = await casStore.getJson<VoipCallControl>(key)
    if (existing) {
      return existing.phase === "reserved"
        ? { status: "reserved" }
        : { status: "alreadyProgressed" }
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
      remainingTtlMs(input.deadlineAt) + VOIP_CONTROL_EXPIRY_MARGIN_MS,
    )
    if (created) {
      return { status: "reserved" }
    }

    // Lost a concurrent race to create the control — defer to whoever won.
    const winner = await casStore.getJson<VoipCallControl>(key)
    return winner && winner.phase === "reserved"
      ? { status: "reserved" }
      : { status: "alreadyProgressed" }
  }

  /**
   * Business-layer orchestration for the P2 ring-tier snapshot: reads
   * presence, then the bounded permissions/team projections, and runs the
   * pure `selectRingTargets` (`ring-targets.ts`) over them. Keeps
   * `handleConnect` thin — the worker only calls this and
   * `reserveIncomingCall`, never assembles the snapshot itself.
   *
   * Load per call: one presence read, one permissions read bounded by
   * online ids, 0/1 team read by id (only when the conversation has an
   * assigned team), one conversation read — all issued concurrently where
   * independent.
   */
  async selectRingTargetsForCall(input: {
    workspaceId: string
    conversationId: string
  }): Promise<RingTargetsSelection> {
    // Nobody online: skip the conversation/permission reads entirely — no
    // tier can resolve any candidates regardless of assignment.
    const onlineUserIds = await workspacePresenceService.listOnlineMembers(
      input.workspaceId,
    )
    if (onlineUserIds.length === 0) {
      return { tier: null, userIds: [] }
    }

    const conversation = await conversationService.findBy({
      where: { id: input.conversationId, workspaceId: input.workspaceId },
    })

    const conversationSnapshot: RingContext["conversation"] = conversation
      ? {
          assignedUserId: conversation.assignedUserId,
          assignedInboxTeamId: conversation.assignedInboxTeamId,
        }
      : null

    const [permissionRows, teamMemberUserIds] = await Promise.all([
      workspaceMemberService.listPermissionsByUserIds({
        workspaceId: input.workspaceId,
        userIds: [...onlineUserIds],
      }),
      conversationSnapshot?.assignedInboxTeamId
        ? inboxTeamService.listUserIdsByTeamId({
            workspaceId: input.workspaceId,
            inboxTeamId: conversationSnapshot.assignedInboxTeamId,
          })
        : Promise.resolve<string[]>([]),
    ])

    return selectRingTargets({
      conversation: conversationSnapshot,
      onlineUserIds,
      permissionsByUserId: new Map(
        permissionRows.map((row) => [row.userId, row.permissions]),
      ),
      teamMemberUserIds,
    })
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
    // Preserves the same {@link VOIP_CONTROL_EXPIRY_MARGIN_MS} margin
    // `reserveIncomingCall` set: `remainingTtlMs` recomputes from "now", so an
    // unmargined renewal here would collapse the control's absolute Redis
    // expiry back to bare `deadlineAt` and reopen Bug 1 for any call that gets
    // claimed before the `expireIfUnanswered` job runs.
    const applied = await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      remainingTtlMs(current.deadlineAt) + VOIP_CONTROL_EXPIRY_MARGIN_MS,
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
   * Liveness: the browser tab holding an `accepted` call calls this on a
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
   * Fenced rollback `answering -> reserved`, reversing `claimForAnswer` after
   * a failed Graph accept or WebRTC negotiation, so the call can be
   * re-answered inside its original deadline instead of being stuck or
   * terminated: other rung agents can claim it again, and an agent who
   * refreshed is picked back up by {@link listResumableIncoming} (which
   * requires exactly `reserved` + empty `reservedUserId`).
   *
   * {@link ALLOWED_TRANSITIONS} stays forward-only for everyone else —
   * allowing `answering -> reserved` there would let other code perform this
   * rollback without the guards below and re-open a call whose accept
   * actually succeeded. Hence an explicit, narrow CAS here.
   *
   * Applies only while the control is still `answering` AND its `fenceToken`
   * matches this attempt's, so a slow retry can never roll back a later
   * claim. `deadlineAt`/`fenceToken` are preserved; only `phase` and
   * `reservedUserId` revert.
   *
   * Returns `true` when the rollback wins the CAS, `false` otherwise (no
   * control, wrong phase, fence mismatch, or a lost race).
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
    // Same margin preservation as `claimForAnswer` above — a rollback must
    // never shrink the control's expiry back to bare `deadlineAt`.
    return await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      remainingTtlMs(current.deadlineAt) + VOIP_CONTROL_EXPIRY_MARGIN_MS,
    )
  }

  /**
   * Creates the outbound (business-initiated) call control, keyed by
   * `wacid` in the SAME `voip:ctrl:<wacid>` namespace inbound calls use —
   * called by the app layer AFTER `connectCall` returns Meta's `wacid`, so
   * (unlike the inbound `reserveIncomingCall` control, which exists before
   * the caller is known) there is exactly one agent from the start:
   * `reservedUserId` is the initiator, never `""`. `SET NX` makes this
   * create-only — a retry of the same dial (same wacid) is a no-op that
   * reports `null` rather than resetting an in-flight control.
   *
   * The control TTL includes {@link VOIP_CONTROL_EXPIRY_MARGIN_MS} so
   * it outlives its own `expireOutboundDial` job, which is scheduled with a
   * delay derived from the SAME `deadlineAt` — without the margin, the
   * control would already be gone by the time that job runs.
   *
   * An action stall between `connectCall` returning and this call
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
        : remainingTtlMs(input.deadlineAt) + VOIP_CONTROL_EXPIRY_MARGIN_MS
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
   *
   * Renews on `deadlineAt + VOIP_CONTROL_EXPIRY_MARGIN_MS`, like every other
   * CAS that renews a still-unanswered control: the call stays unanswered
   * through this transition, so without the margin this write would SHORTEN
   * the TTL `startOutboundDial` set and let the key expire just before
   * `expireOutboundDial` runs — the same race that left inbound calls stuck
   * at `ringing`.
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
      remainingTtlMs(current.deadlineAt) + VOIP_CONTROL_EXPIRY_MARGIN_MS,
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
   * Three guards must agree: the row is `accepted`, its Redis control is
   * gone or terminated, and it has had no heartbeat for
   * {@link ACTIVE_CALL_LIVENESS_STALE_MS}. The last two are ONE conditional
   * UPDATE, not a claim then a finalize — a claim would bump `updatedAt`
   * itself, so in the gap a heartbeat could no longer prove liveness and a
   * live call could be closed. As one statement a concurrent heartbeat just
   * makes the UPDATE match nothing.
   *
   * Returns true only when this call personally made the transition, or when a
   * re-read shows the row reached a terminal status by itself while we were
   * looking (a real `terminate` landing in the same instant) — which equally
   * means the contact is free. Anything else refuses the dial.
   *
   * The recovered row is `completed`, not `failed` — reaching `accepted`
   * means it connected. `durationSeconds`/`endedAt` stay null rather than
   * guessed; a delayed terminate can still fill them in. No activity card,
   * realtime event or trigger fires: those belong to an authoritative
   * terminate, and inventing them is the very problem that killed the sweep.
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
  async finalizeEndedCall(
    input: {
      whatsappCallId: string
      endedAt: Date
      startedAt?: Date | null
      durationSeconds?: number | null
      messageId?: string | null
      lastError?: string | null
      current?: WhatsappCallModel
    } & WhatsappCallTerminalStatusOutcomePair,
  ): Promise<WhatsappCallModel | undefined> {
    const { whatsappCallId, ...finalization } = input
    return await whatsappCallRepository.finalizeById({
      id: whatsappCallId,
      ...finalization,
    })
  }
}

export const whatsappVoipCallService = new WhatsappVoipCallService()
