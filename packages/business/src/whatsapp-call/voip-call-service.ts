import type { WhatsappCallStatus } from "@chatbotx.io/database/partials"
import {
  WHATSAPP_CALL_TERMINAL_STATUSES,
  whatsappCallRepository,
} from "@chatbotx.io/database/repositories"
import type { WhatsappCallModel } from "@chatbotx.io/database/types"
import { casStore } from "@chatbotx.io/redis"
import { contactService } from "../contact/service"
import { contactInboxService } from "../contact-inbox/service"
import { logger } from "../logger"
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
  OUTBOUND_CONTROL_TTL_MARGIN_MS,
  remainingTtlMs,
  STRANDED_CALL_RECOVERED_LAST_ERROR,
  TERMINATED_CONTROL_TTL_MS,
  VOIP_END_OUTCOME_BY_PHASE,
  type VoipCallControl,
  type VoipCallPhase,
} from "./voip-call-control"
import { whatsappVoipPresenceService } from "./voip-presence-service"
import { whatsappVoipSignalingService } from "./voip-signaling-service"

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
   * Re-discovers every still-ringing, still-unclaimed VoIP call for
   * `workspaceId` so an agent who refreshed their browser (F5) mid-ring can
   * re-show ALL of them — ring-all means more than one caller can be ringing
   * this workspace at once, and the one-shot realtime ring event for each is
   * otherwise gone once the socket reconnects, even though the Redis
   * offer/control TTL (~55s) means those calls may still be answerable.
   *
   * The DB query (`findRingingByWorkspace`) is only a coarse prefilter;
   * membership in the ring-all/unclaimed state is decided here, against
   * Redis, which stays the single source of truth: a row qualifies only when
   * its control record exists, is still `phase: "reserved"` with
   * `reservedUserId: ""` (nobody has claimed it — a claimed call is being
   * answered by someone else and must not be re-shown), AND its offer is
   * still present. Every qualifying row is returned (bounded by the
   * repository's small `limit`, so this does at most that many Redis reads
   * — see {@link resolveResumableCandidate}), never just the first, so a
   * caller who refreshes mid-ring sees every call still worth answering.
   *
   * Candidates are resolved CONCURRENTLY via one `Promise.all` over every
   * candidate, never awaited one at a time — but this is NOT the same Redis
   * cost as before this became plural: the old singular method returned at
   * the FIRST qualifying candidate, while this resolves EVERY candidate
   * unconditionally. At the repository's `FIND_RINGING_BY_WORKSPACE_LIMIT`
   * of 20 that is up to 40 Redis reads (`readControl` + `readOffer` per
   * candidate) plus up to 20 contact-inbox and 20 contact DB reads (via
   * `resolveWhatsappCallerName`), all fired concurrently, per agent resume
   * fetch. This only fires when calls are actually ringing (the DB
   * prefilter), and the bound stays fixed at the repository's small limit
   * regardless of how ringing-heavy the workspace gets, which is why the
   * fan-out is the accepted design rather than a regression to fix. Still,
   * `Promise.all` over the candidate list resolves in the ORIGINAL array
   * order regardless of which Redis read finishes first,
   * so the result stays exactly the order `findRingingByWorkspace` returned
   * — newest-created-first (its `orderBy(desc(createdAt))`), with
   * unqualified candidates simply absent rather than reordering the rest.
   * The caller (the resume action, then the ring basket) can rely on that
   * order for rendering. Returns `[]`, never `null`, when nothing qualifies.
   */
  async listResumableIncoming(input: {
    workspaceId: string
  }): Promise<ResumableIncomingVoipCall[]> {
    const candidates = await whatsappCallRepository.findRingingByWorkspace(
      input.workspaceId,
    )

    const resolved = await Promise.all(
      candidates.map((call) => this.resolveResumableCandidate(call)),
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
   */
  private async resolveResumableCandidate(
    call: WhatsappCallModel,
  ): Promise<ResumableIncomingVoipCall | null> {
    if (!call.wacid) {
      return null
    }
    const [control, offer] = await Promise.all([
      this.readControl(call.wacid),
      whatsappVoipSignalingService.readOffer(call.wacid),
    ])
    if (!control) {
      return null
    }
    if (control.phase !== "reserved" || control.reservedUserId !== "") {
      return null
    }
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
   *   {@link WhatsappVoipCallService.listResumableIncoming}, which requires
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
