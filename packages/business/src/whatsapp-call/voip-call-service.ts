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
 * Result of `reserveIncomingCall`. `reserved`: a ringing control exists (new or
 * from an earlier delivery) — ring the targets. `alreadyProgressed`: the call
 * is past ringing — do nothing, so a live call is never re-rung or downgraded.
 */
export type ReserveIncomingCallResult =
  | { status: "reserved" }
  | { status: "alreadyProgressed" }
/**
 * Caller display name for the ring UI, shared by live rings and resume-after-
 * refresh. A miss falls back to "unknown caller" and never blocks the ring.
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
 * Matches the client's `addIncoming` payload, so resume results can be passed
 * straight in.
 */
export type StartOutboundDialInput = {
  wacid: string
  initiatorUserId: string
  deadlineAt: number
}
/**
 * Thrown when the contact already has a live call in either direction — checked
 * before dialing.
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
 * The VoIP call-control state machine (Redis, fenced CAS) and the call row's
 * lifecycle writes. SDP storage and webhook entry points live in
 * `whatsappVoipSignalingService`.
 */
class WhatsappVoipCallService {
  async readControl(wacid: string): Promise<VoipCallControl | null> {
    return await casStore.getJson<VoipCallControl>(controlKey(wacid))
  }

  /**
   * Re-finds every still-ringing, unclaimed call so an agent who refreshed sees
   * them again. The DB is only a prefilter; Redis decides (control `reserved`
   * and unclaimed, offer present). Candidates resolve concurrently, bounded by
   * the repository limit; order is newest first.
   */
  async listResumableIncoming(input: {
    workspaceId: string
    userId: string
  }): Promise<ResumableIncomingVoipCall[]> {
    // The caller's permissions are the same for every candidate — load them
    // once.
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
   * Liveness check for one candidate: control exists, `reserved` and unclaimed,
   * the caller is eligible, and the offer is present — checked in that order,
   * so an ineligible caller never reads (or sees) the offer SDP. Returns `null`
   * instead of throwing so the caller can filter.
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
   * Claims the call as `terminated` before refusing it, with the same `SET NX`
   * `reserveIncomingCall` uses, so exactly one wins. Reading then rejecting
   * would race an agent claiming the call in between. If we win, no control can
   * appear behind us and the Graph reject is safe; if we lose, defer to
   * `endCall`'s fenced CAS.
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
   * Creates the ringing control before any retryable read so a retry can never
   * leave a call without a deadline. `SET NX`: a redelivered connect just
   * observes the existing `reserved` control and re-runs target selection.
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

    // Lost the race to create the control — defer to the winner.
    const winner = await casStore.getJson<VoipCallControl>(key)
    return winner && winner.phase === "reserved"
      ? { status: "reserved" }
      : { status: "alreadyProgressed" }
  }

  /**
   * Loads presence, permissions and team members, then runs the pure
   * `selectRingTargets`. Reads are bounded by the online set and issued
   * concurrently.
   */
  async selectRingTargetsForCall(input: {
    workspaceId: string
    conversationId: string
  }): Promise<RingTargetsSelection> {
    // Nobody online — no tier can match, skip the reads.
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
   * `reserved -> answering`: the first eligible agent claims the call (ring-
   * all). Atomic via the CAS, so two answerers cannot both win. Returns the
   * fence token, or `null`.
   */
  async claimForAnswer(input: {
    wacid: string
    userId: string
  }): Promise<string | null> {
    const key = controlKey(input.wacid)
    const current = await casStore.getJson<VoipCallControl>(key)
    // Claimable only while unclaimed and ringing; a second claim (even a retry
    // by the same agent) loses.
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
    // Keep the expiry margin — renewing from bare `deadlineAt` would let the
    // control expire before `expireIfUnanswered` runs.
    const applied = await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      remainingTtlMs(current.deadlineAt) + VOIP_CONTROL_EXPIRY_MARGIN_MS,
    )
    return applied ? current.fenceToken : null
  }

  /**
   * `answering -> accepted`, fenced: loses to an `endCall` that landed first
   * (e.g. Meta's terminate racing the accept).
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
   * Heartbeat from the tab holding an `accepted` call, so a stranded call (lost
   * terminate) can be told apart from a long live one. A no-op unless the call
   * belongs to this workspace and agent and is still `accepted`. Renews the
   * control's TTL with a fenced CAS and refreshes the DB row's liveness, which
   * is what recovery trusts.
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
      // Redis lost the control but the row says this agent's call is live —
      // keep refreshing the row's liveness.
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
   * Durable liveness on the row's `updatedAt`, throttled by the WHERE clause.
   * Never throws.
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
   * The single termination path for every end-of-call case. Advances to
   * `terminated` from any non-final phase and returns the phase it ended from
   * plus the Graph action Meta expects. A win is permanent — a later
   * `commitAccepted` loses. `null` means nothing to end; callers treat it as
   * success.
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
    // Always one of the terminable phases — the transition guard above excludes
    // the rest.
    if (!isTerminableVoipCallPhase(current.phase)) {
      return null
    }
    return {
      fromPhase: current.phase,
      ...VOIP_END_OUTCOME_BY_PHASE[current.phase],
    }
  }

  /**
   * Fenced `answering -> reserved` rollback after a failed accept, so the call
   * can still be answered before its deadline. Kept out of
   * `ALLOWED_TRANSITIONS` so nothing else can reopen a call whose accept
   * succeeded. Applies only while still `answering` with this attempt's fence.
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
    // Keep the expiry margin on rollback too.
    return await casStore.compareAndSwap<VoipCallControl>(
      key,
      current,
      next,
      remainingTtlMs(current.deadlineAt) + VOIP_CONTROL_EXPIRY_MARGIN_MS,
    )
  }

  /**
   * Creates the outbound call control after `connectCall` returns the wacid;
   * the initiator owns it from the start. `SET NX` makes a retried dial a no-
   * op. The TTL margin outlives `expireOutboundDial`. If Meta's ACCEPTED
   * already landed during a stall, the control starts `accepted` so the expiry
   * job cannot kill a live call.
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
   * `dialing -> ringing`, best-effort — Meta's RINGING may be late, lost or
   * after ACCEPTED; `false` is not an error. Renews with the expiry margin so
   * this write never shortens the TTL `startOutboundDial` set.
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
   * `dialing|ringing -> accepted`, best-effort, so a later hangup ends as
   * answered. The DB row's `accepted` is written by `markAcceptedIfActive`.
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
   * Glare guard before dialing: throws `WhatsappCallInProgressError` if the
   * contact has a live call in either direction — mirrors Meta's 138003 without
   * the round trip.
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
   * Recovers a call stuck `accepted` after a lost terminate — otherwise the
   * one-live-call guard blocks the contact forever. Only runs on redial (human
   * confirmation the old call is over), never on a timer. The stale-heartbeat
   * check and control check happen in one conditional UPDATE so a heartbeat can
   * still win the race.
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

    // Lost the update: either a heartbeat proved the call live, or a real
    // terminate got there first (the contact is free).
    const latest = await whatsappCallRepository.findById(call.id)
    return !(
      latest &&
      (latest.status === "accepted" || latest.status === "ringing")
    )
  }

  /**
   * Inserts the outbound attempt row before dialing, with the agent as
   * initiator and answerer so Meta's answer webhook and the recording upload
   * can reach them. Throws `WhatsappCallPendingOutboundExistsError` if the
   * contact already has a live attempt.
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
   * How to end a live call with no control, derived from its row the same way
   * `endCall` derives it from the phase. `null` if already terminal.
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
   * Binds Meta's call id to the outbound attempt row, merging any row a webhook
   * created for the same call. Idempotent.
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
   * Persists acceptance after Meta confirmed it. `false` means a hangup
   * finished the call first — the caller must compensate.
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
   * Writes the terminal status and outcome. Never downgrades, and only fills
   * missing fields on a redelivery, so every caller is idempotent.
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
