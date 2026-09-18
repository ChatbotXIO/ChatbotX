"use client"

import { create } from "zustand"

/**
 * Lifecycle of a single browser-WebRTC (VoIP-transport) WhatsApp call.
 * Inbound: `incomingRinging` -> `answering` -> `active` -> `ended`, or
 * `incomingRinging` -> `ended` (reject) / any state -> `ended` (hangup, the
 * remote ending the call, or a `cannotAnswer`/`callEnded` answer outcome).
 * Outbound (business-initiated): `preparing` (instant, client-only, keyed by
 * a local `attemptId` nonce — no `whatsappCallId` exists yet) ->
 * `outboundDialing` -> `outboundRinging` -> `active` -> `ended`, driven by
 * the `whatsappCallOutboundStatus` realtime event (never
 * `pc.connectionState`, which reports transport health rather than whether
 * the callee actually picked up).
 *
 * `ended` LINGERS in the store (rather than nulling the slot immediately) so
 * the call panel can show a final "No answer" / "Declined" / "Call ended ·
 * 00:12" / "Call failed" message for a couple of seconds before the UI
 * clears itself — see `handleEnded` and the auto-dismiss effect in
 * `useWhatsappVoipCall`.
 */
export const WhatsappVoipCallPhase = {
  preparing: "preparing",
  incomingRinging: "incomingRinging",
  answering: "answering",
  outboundDialing: "outboundDialing",
  outboundRinging: "outboundRinging",
  active: "active",
  ended: "ended",
} as const
export type WhatsappVoipCallPhase =
  (typeof WhatsappVoipCallPhase)[keyof typeof WhatsappVoipCallPhase]

/** Who placed the call — mirrors `WhatsappCall.direction`. Inbound and
 * outbound stay mutually exclusive in the single call slot below. */
export const WhatsappVoipCallDirection = {
  inbound: "inbound",
  outbound: "outbound",
} as const
export type WhatsappVoipCallDirection =
  (typeof WhatsappVoipCallDirection)[keyof typeof WhatsappVoipCallDirection]

/** Terminal outcome carried by the `whatsappCallTransportEnded` realtime
 * event — drives the ~2s "ended" linger message in the call panel.
 * `connectionLost` is client-only: set when the local
 * `RTCPeerConnection` reports `failed`, or `disconnected` for longer than
 * the grace window, rather than by a server-sent transport-ended event. */
export type WhatsappVoipEndedStatus =
  | "completed"
  | "rejected"
  | "failed"
  | "connectionLost"

/** Which async step of `startOutbound` is currently in flight — drives the
 * "Preparing…" / "Waiting for microphone access…" status line while
 * `phase === preparing`. */
export type WhatsappVoipPreparingStage = "turn" | "mic" | "offer" | "initiate"

export type WhatsappVoipCall = {
  transport: "voip"
  /**
   * While `phase === "preparing"` this is the client-generated `attemptId`
   * nonce (no server-side call exists yet) — see `startPreparing`. Every
   * other phase carries the real server `WhatsappCall.id`.
   */
  whatsappCallId: string
  /** Empty string placeholder while `phase === "preparing"`. */
  wacid: string
  phase: WhatsappVoipCallPhase
  direction: WhatsappVoipCallDirection
  conversationId: string
  contactInboxId: string
  contactName?: string | null
  /** The SDP offer delivered with the incoming event — consumed by the
   * inbound answer flow. Absent for an outbound call (the browser generates
   * the offer itself, in the hook, before the row even exists). */
  offer?: { sdpType: "offer"; sdp: string }
  /** Server-generated identifier for an outbound dial attempt — correlates
   * the async SDP answer and status events back to this call. Set to the
   * local nonce while `phase === "preparing"`; replaced with the server's
   * `attemptId` once `upgradeToDialing` runs. */
  attemptId?: string
  deadlineAt: string
  isMuted: boolean
  /** Reflects "recording requested" — set from the initiate/answer
   * action's `recordingRequested` the moment the call is created/upgraded,
   * NOT from whether a browser `MediaRecorder` actually started. Under the
   * default `metaNative` mode Meta records the call server-side even though
   * the browser never captures anything locally; this still drives the "●
   * Recording requested" indicator in the call panel so the agent knows the
   * call is being recorded either way. */
  isRecording: boolean
  startedAt?: number
  /** Set by `handleEnded` — which of the lingering "ended" messages the
   * panel should show. Undefined outside `phase === "ended"`. */
  endedStatus?: WhatsappVoipEndedStatus
  /** Set only while `phase === "preparing"`. */
  preparingStage?: WhatsappVoipPreparingStage
}

export type WhatsappVoipIncomingData = {
  whatsappCallId: string
  wacid: string
  conversationId: string
  contactInboxId: string
  contactName?: string | null
  offer: { sdpType: "offer"; sdp: string }
  deadlineAt: string
}

/**
 * A call OFFERED to this agent but not yet answered — lives in the
 * `ringingCalls` basket below. A basket entry owns no `RTCPeerConnection`,
 * no microphone track and no timer, so the basket is pure data; it only
 * becomes "the call this agent is engaged with" (the `call` slot) once
 * `promoteRinging` moves it there.
 *
 * INVARIANT: a `whatsappCallId` is never simultaneously in `ringingCalls`
 * and in `call` — `enqueueRinging` skips an id already occupying the slot,
 * and `promoteRinging` removes the basket entry and writes the slot in the
 * same `set()`, so there is no state in which both are true.
 */
export type WhatsappVoipRingingCall = WhatsappVoipIncomingData

export type WhatsappVoipOutboundData = {
  whatsappCallId: string
  wacid: string
  attemptId: string
  conversationId: string
  contactInboxId: string
  contactName?: string | null
  deadlineAt: string
  /** True only when the BROWSER MediaRecorder should capture this call —
   * never true under `metaNative` mode. */
  browserRecordingEnabled: boolean
  /** True when recording was requested in any form (Meta-native or
   * browser) — drives the store's `isRecording` display flag. */
  recordingRequested: boolean
}

export type WhatsappVoipPreparingData = {
  conversationId: string
  contactInboxId: string
  contactName?: string | null
}

/** The decoupled handoff for an outbound call's SDP answer — set by
 * `chat-realtime.tsx` when the `whatsappCallOutboundAnswer` realtime event
 * arrives, and consumed (then cleared) by `useWhatsappVoipCall`'s effect
 * that calls `setRemoteDescription`. Decoupled from the call object itself
 * so the hook can ignore a stale answer for a call the store no longer
 * holds (e.g. the agent reloaded) without threading SDP through `call`. */
export type WhatsappVoipPendingOutboundAnswer = {
  whatsappCallId: string
  sdp: string
}

/** True when the single `call` slot is unoccupied and can accept a new
 * call — a lingering `ended` call is FREE, not occupied, since it is only
 * still in the slot so the panel can show its terminal message for ~2s (see
 * the identical rule inlined in `addOutbound`/`startPreparing` below).
 * Factored out as a standalone helper — and exported — so every consumer of
 * this rule (`promoteRinging` here, plus `WhatsappCallPanel`'s `slotFree`
 * and the `slotIsEngaged` checks in `useWhatsappVoipCall`'s `answer()` and
 * `WhatsappVoipCallProvider`) shares the ONE definition instead of
 * re-deriving it inline in four places that would silently drift the moment
 * a new terminal phase is added. `addOutbound`/`startPreparing` keep their
 * own inline checks as-is, since this slice only ADDS to the store and does
 * not touch the existing mutations. */
export function isCallSlotFree(call: WhatsappVoipCall | null): boolean {
  return !call || call.phase === WhatsappVoipCallPhase.ended
}

/**
 * The phase an outbound call lands in when Meta's status for it arrived
 * BEFORE its real id reached the slot — see `pendingOutboundStatus`.
 */
/** How long a `pendingConversationOpen` request stays honorable — see its
 * doc comment. Generous enough for a normal route transition to land, small
 * enough that "much later" can never reopen a stale request. */
export const PENDING_CONVERSATION_OPEN_MAX_AGE_MS = 15_000

const OUTBOUND_PHASE_BY_BUFFERED_STATUS: Record<
  "ringing" | "accepted",
  WhatsappVoipCallPhase
> = {
  ringing: WhatsappVoipCallPhase.outboundRinging,
  accepted: WhatsappVoipCallPhase.active,
}

type WhatsappVoipCallState = {
  /** The call this agent is ENGAGED with — at most one at a time, and
   * inbound/outbound stay mutually exclusive in this one slot. Several
   * offers can be pending at once under ring-all (see `ringingCalls`
   * below); this slot only ever holds the one the agent answered or is
   * dialing. */
  call: WhatsappVoipCall | null
  /** Calls OFFERED to this agent but not yet answered — see
   * `WhatsappVoipRingingCall`. Ordered by arrival (append-only, dropped by
   * id). Disjoint from `call` at all times — see the invariant documented
   * on `WhatsappVoipRingingCall`. */
  ringingCalls: WhatsappVoipRingingCall[]
  /**
   * The conversation id the agent asked to view — set by
   * `WhatsappCallPanel`'s "Go to conversation" control, and by the D6
   * navigate-on-answer flow — while ALREADY on the inbox route. A plain
   * `router.push` there would only change the `conversationId` query param
   * without re-running `ConversationList`'s one-shot bootstrap effect, so it
   * would never actually select the conversation. This module-level store
   * is reachable from both the calling layer (`whatsapp-call-panel.tsx`,
   * outside `ChatStoreProvider` — see `workspace-realtime-shell.tsx`) and
   * the chat feature (`chat-realtime.tsx`, inside it) without either
   * needing to cross that boundary via React context — the same pattern
   * `ringingCalls` already uses for bubble-to-top, just in the opposite
   * direction. `null` when nothing is pending.
   *
   * Stamped with `requestedAt` because `isOnInbox` (the panel's own gate for
   * writing this) is a bare pathname string check, not proof that a
   * `ChatRealtime` subscriber is actually mounted to consume it — a
   * transient routing mismatch (mid-navigation, a Suspense boundary) could
   * in principle leave this set with nothing listening. Without an age
   * check, a LATER, unrelated mount of the inbox (e.g. the agent leaves and
   * comes back much later) would silently reopen a stale request. See
   * `consumePendingConversationOpen`.
   */
  pendingConversationOpen: {
    conversationId: string
    requestedAt: number
  } | null
  pendingOutboundAnswer: WhatsappVoipPendingOutboundAnswer | null
  /** Appends a new ring to the basket. A no-op when redelivered: either the
   * id is already sitting in the basket, or it is the id currently occupying
   * the `call` slot (already promoted, so no longer merely "offered") —
   * either way a duplicate row must never appear. */
  enqueueRinging: (data: WhatsappVoipIncomingData) => void
  /** Drops a basket entry by id. A no-op when the id is not present. */
  removeRinging: (whatsappCallId: string) => void
  /** Drops every basket entry whose `conversationId` is in the given list,
   * in one store update — used by the `conversationAssigned` realtime
   * handler when a conversation is reassigned to someone else while still
   * ringing this agent, instead of looping `removeRinging` per entry. A
   * no-op when no entry matches. */
  removeRingingByConversationIds: (conversationIds: readonly string[]) => void
  /** Records the conversation the agent wants to view while already on the
   * inbox — see `pendingConversationOpen`. Stamps `requestedAt: Date.now()`. */
  setPendingConversationOpen: (conversationId: string) => void
  /**
   * Atomically reads and clears the pending-open request (so a caller
   * mounting more than once, or a duplicate notification, can never consume
   * it twice), returning the conversation id ONLY when it is still fresh
   * (within `PENDING_CONVERSATION_OPEN_MAX_AGE_MS` of `requestedAt`) —
   * `null` otherwise, including when nothing was pending at all. `now`
   * defaults to `Date.now()`, overridable for tests.
   */
  consumePendingConversationOpen: (now?: number) => string | null
  /** Atomically moves one basket entry into the single `call` slot (phase
   * `incomingRinging`, `isMuted`/`isRecording` false). Returns `true` on
   * success; `false` when
   * the id is not in the basket, or the slot is occupied by a call that is
   * not free (see `isCallSlotFree` — a lingering `ended` call IS free). On
   * `false` the basket and slot are both left untouched. */
  promoteRinging: (whatsappCallId: string) => boolean
  /** Empties the basket. Does not touch the `call` slot. */
  clearRinging: () => void
  addOutbound: (data: WhatsappVoipOutboundData) => void
  /** Claims the single call slot INSTANTLY, keyed by the client `attemptId`
   * nonce — before any TURN/getUserMedia/offer/ICE/initiate work starts, so
   * the call panel renders the moment the agent clicks. A no-op while the
   * slot is already occupied. */
  startPreparing: (attemptId: string, data: WhatsappVoipPreparingData) => void
  /** Updates the "which async step" indicator shown during `preparing`. */
  setPreparingStage: (
    attemptId: string,
    stage: WhatsappVoipPreparingStage,
  ) => void
  /** Transitions a `preparing` call to `outboundDialing` once
   * `initiateOutboundVoipCallAction` resolves with a real server call — a
   * no-op unless the slot still holds the matching preparing attempt (it
   * may have been cancelled/released in the meantime). */
  upgradeToDialing: (attemptId: string, data: WhatsappVoipOutboundData) => void
  /** Releases the slot claimed by `startPreparing` — a no-op unless the slot
   * still holds the matching preparing attempt. Used both when the agent
   * cancels before a real call exists, and when the dial attempt resolves to
   * a non-`"dialing"` outcome (needs permission, ineligible, failed, …). */
  releasePreparing: (attemptId: string) => void
  setPhase: (whatsappCallId: string, phase: WhatsappVoipCallPhase) => void
  /**
   * Meta's outbound status for a call whose id the slot does not hold YET.
   * The slot carries a client nonce until `initiateOutboundVoipCallAction`
   * returns, but Meta can emit ACCEPTED as soon as it binds the wacid —
   * before that return. Dropping it there would leave a connected customer
   * talking to an agent whose microphone is never attached, until the
   * deadline backstop hangs the call up. Buffered here and applied by
   * `upgradeToDialing`, mirroring how `pendingOutboundAnswer` already
   * buffers the SDP answer for exactly the same race.
   */
  pendingOutboundStatus: {
    whatsappCallId: string
    status: "ringing" | "accepted"
  } | null
  setOutboundStatus: (
    whatsappCallId: string,
    status: "ringing" | "accepted",
  ) => void
  /** Transitions the matching call to `active` and stamps `startedAt`.
   * Refuses (and reports `false`) when the id doesn't match the current
   * slot, OR when the slot's call has already reached the terminal `ended`
   * phase — e.g. the realtime `whatsappCallTransportEnded` handler already
   * ran `handleEnded` for this exact id while an in-flight accept round-trip
   * was still resolving. `ended` is terminal; no caller ever legitimately
   * resurrects it out of it, so refusing here at the store level protects
   * every present and future caller rather than requiring each call site to
   * re-check the phase itself. Returns `true` only when the transition
   * actually applied — mirroring `promoteRinging` — so a caller (see
   * `useWhatsappVoipCall`'s answer flow) can tell a refusal apart from
   * success and tear down / send a compensating hangup instead of silently
   * treating a refused activation as a success. */
  markActive: (whatsappCallId: string) => boolean
  setMuted: (muted: boolean) => void
  setRecording: (recording: boolean) => void
  setPendingOutboundAnswer: (data: WhatsappVoipPendingOutboundAnswer) => void
  clearPendingOutboundAnswer: () => void
  reset: () => void
  /** Moves the matching call to the lingering `ended` phase (never a bare
   * null) so the panel can show a final status message — see
   * `WhatsappVoipEndedStatus`. `status` defaults to `"completed"` when
   * omitted (callers that only know the call is over, not why). */
  handleEnded: (
    whatsappCallId: string,
    status?: WhatsappVoipEndedStatus,
  ) => void
}

export const useWhatsappVoipCallStore = create<WhatsappVoipCallState>(
  (set, get) => ({
    call: null,
    ringingCalls: [],
    pendingConversationOpen: null,
    pendingOutboundAnswer: null,
    pendingOutboundStatus: null,

    enqueueRinging: (data) =>
      set((state) => {
        const alreadyInBasket = state.ringingCalls.some(
          (ringing) => ringing.whatsappCallId === data.whatsappCallId,
        )
        // An id already occupying the slot has been promoted — it is being
        // handled, not merely offered, so a redelivered offer for it must
        // not re-appear in the basket (that would violate the
        // basket/slot-disjoint invariant the moment it is later promoted
        // again).
        const alreadyInSlot = state.call?.whatsappCallId === data.whatsappCallId
        if (alreadyInBasket || alreadyInSlot) {
          return state
        }
        return {
          ringingCalls: [...state.ringingCalls, data],
        }
      }),

    removeRinging: (whatsappCallId) =>
      set((state) => {
        const nextRingingCalls = state.ringingCalls.filter(
          (ringing) => ringing.whatsappCallId !== whatsappCallId,
        )
        if (nextRingingCalls.length === state.ringingCalls.length) {
          return state
        }
        return { ringingCalls: nextRingingCalls }
      }),

    removeRingingByConversationIds: (conversationIds) =>
      set((state) => {
        const dropIds = new Set(conversationIds)
        const nextRingingCalls = state.ringingCalls.filter(
          (ringing) => !dropIds.has(ringing.conversationId),
        )
        if (nextRingingCalls.length === state.ringingCalls.length) {
          return state
        }
        return { ringingCalls: nextRingingCalls }
      }),

    setPendingConversationOpen: (conversationId) =>
      set({
        pendingConversationOpen: { conversationId, requestedAt: Date.now() },
      }),

    consumePendingConversationOpen: (now = Date.now()) => {
      const pending = get().pendingConversationOpen
      if (!pending) {
        return null
      }
      set({ pendingConversationOpen: null })
      const isFresh =
        now - pending.requestedAt <= PENDING_CONVERSATION_OPEN_MAX_AGE_MS
      return isFresh ? pending.conversationId : null
    },

    // ATOMICITY: zustand's `set` updater receives the current state and
    // returns the next partial state, but has no channel back to the
    // caller — while `get()` gives a channel back but, called separately
    // from `set()`, would open a window between "decide" and "write" where
    // the decision could go stale before the write lands. Both the decision
    // (is the id in the basket? is the slot free?) and the write (remove
    // from the basket, occupy the slot) therefore happen inside ONE
    // synchronous `set` callback below; a closed-over `promoted` variable
    // smuggles the boolean result back out. `set` invokes its updater
    // synchronously (zustand has no async/batched update path), so
    // `promoted` is guaranteed to be assigned before this function returns —
    // there is no window in which another caller could observe or mutate
    // state between the check and the write.
    promoteRinging: (whatsappCallId) => {
      let promoted = false
      set((state) => {
        const index = state.ringingCalls.findIndex(
          (ringing) => ringing.whatsappCallId === whatsappCallId,
        )
        if (index === -1 || !isCallSlotFree(state.call)) {
          return state
        }
        const incoming = state.ringingCalls[index]
        promoted = true
        return {
          ringingCalls: state.ringingCalls.filter((_, i) => i !== index),
          call: {
            ...incoming,
            transport: "voip",
            direction: WhatsappVoipCallDirection.inbound,
            phase: WhatsappVoipCallPhase.incomingRinging,
            isMuted: false,
            isRecording: false,
          },
        }
      })
      return promoted
    },

    clearRinging: () => set({ ringingCalls: [] }),

    // A no-op while the slot is occupied by any other in-progress call (the
    // hook's `startOutbound` also short-circuits before this is ever
    // reached, but the guard here keeps the store itself safe against any
    // other caller) — keeps inbound and outbound mutually exclusive in the
    // one slot.
    addOutbound: (data) =>
      set((state) => {
        // A lingering `ended` call is FREE, not occupied — see
        // `isCallSlotFree`.
        if (state.call && state.call.phase !== WhatsappVoipCallPhase.ended) {
          return state
        }
        return {
          call: {
            ...data,
            transport: "voip",
            direction: WhatsappVoipCallDirection.outbound,
            phase: WhatsappVoipCallPhase.outboundDialing,
            isMuted: false,
            isRecording: data.recordingRequested,
          },
        }
      }),

    startPreparing: (attemptId, data) =>
      set((state) => {
        // A lingering `ended` call is FREE, not occupied — see
        // `isCallSlotFree`.
        if (state.call && state.call.phase !== WhatsappVoipCallPhase.ended) {
          return state
        }
        return {
          call: {
            transport: "voip",
            whatsappCallId: attemptId,
            wacid: "",
            phase: WhatsappVoipCallPhase.preparing,
            direction: WhatsappVoipCallDirection.outbound,
            conversationId: data.conversationId,
            contactInboxId: data.contactInboxId,
            contactName: data.contactName,
            attemptId,
            // Not the real deadline — `phase === "preparing"` is excluded
            // from the deadline-backstop effect; this value is never read.
            deadlineAt: new Date().toISOString(),
            isMuted: false,
            isRecording: false,
          },
        }
      }),

    setPreparingStage: (attemptId, stage) =>
      set((state) =>
        state.call?.whatsappCallId === attemptId &&
        state.call.phase === WhatsappVoipCallPhase.preparing
          ? { call: { ...state.call, preparingStage: stage } }
          : state,
      ),

    upgradeToDialing: (attemptId, data) =>
      set((state) => {
        if (
          state.call?.whatsappCallId !== attemptId ||
          state.call.phase !== WhatsappVoipCallPhase.preparing
        ) {
          return state
        }
        // A status Meta sent before this id reached the slot (see
        // `pendingOutboundStatus`) must take effect now, or an already-
        // answered call would sit in `outboundDialing` with no microphone.
        const buffered =
          state.pendingOutboundStatus?.whatsappCallId === data.whatsappCallId
            ? state.pendingOutboundStatus
            : undefined
        const phase = buffered
          ? OUTBOUND_PHASE_BY_BUFFERED_STATUS[buffered.status]
          : WhatsappVoipCallPhase.outboundDialing
        return {
          pendingOutboundStatus: buffered ? null : state.pendingOutboundStatus,
          call: {
            ...data,
            transport: "voip",
            direction: WhatsappVoipCallDirection.outbound,
            phase,
            isMuted: false,
            isRecording: data.recordingRequested,
            ...(buffered?.status === "accepted"
              ? { startedAt: Date.now() }
              : {}),
          },
        }
      }),

    releasePreparing: (attemptId) =>
      set((state) =>
        state.call?.whatsappCallId === attemptId &&
        state.call.phase === WhatsappVoipCallPhase.preparing
          ? { call: null }
          : state,
      ),

    setPhase: (whatsappCallId, phase) =>
      set((state) =>
        state.call?.whatsappCallId === whatsappCallId
          ? { call: { ...state.call, phase } }
          : state,
      ),

    setOutboundStatus: (whatsappCallId, status) =>
      set((state) => {
        if (state.call?.whatsappCallId !== whatsappCallId) {
          // Not (yet) the slot's call. While an outbound dial is still
          // `preparing` the slot holds a client nonce, so this is how a real
          // ACCEPTED arrives before the initiate action returns — buffer it
          // for `upgradeToDialing` rather than losing it. `accepted` is never
          // downgraded by a later `ringing`: Meta does not order these.
          if (state.pendingOutboundStatus?.status === "accepted") {
            return state
          }
          return {
            pendingOutboundStatus: { whatsappCallId, status },
          }
        }
        if (state.call.direction !== WhatsappVoipCallDirection.outbound) {
          return state
        }
        // Meta's outbound status events are NOT ordered — the worker says so
        // explicitly where it forwards them — so this must never move a call
        // BACKWARDS or revive a finished one. Two concrete failures without
        // these guards: a delayed RINGING landing after ACCEPTED regresses a
        // live call to `outboundRinging`, where the hook's deadline backstop
        // is armed again and can hang up a call that is mid-conversation; and
        // a delayed ACCEPTED landing after the agent cancelled turns the
        // lingering `ended` message into a phantom `active` call whose peer
        // and microphone were already torn down. `ended` is terminal (the
        // same rule `markActive` enforces), and `active` never goes back to
        // ringing.
        if (state.call.phase === WhatsappVoipCallPhase.ended) {
          return state
        }
        if (status === "ringing") {
          if (state.call.phase === WhatsappVoipCallPhase.active) {
            return state
          }
          return {
            call: {
              ...state.call,
              phase: WhatsappVoipCallPhase.outboundRinging,
            },
          }
        }
        return {
          call: {
            ...state.call,
            phase: WhatsappVoipCallPhase.active,
            startedAt: Date.now(),
          },
        }
      }),

    markActive: (whatsappCallId) => {
      let activated = false
      set((state) => {
        if (
          state.call?.whatsappCallId !== whatsappCallId ||
          state.call.phase === WhatsappVoipCallPhase.ended
        ) {
          return state
        }
        activated = true
        return {
          call: {
            ...state.call,
            phase: WhatsappVoipCallPhase.active,
            startedAt: Date.now(),
          },
        }
      })
      return activated
    },

    setMuted: (muted) =>
      set((state) =>
        state.call ? { call: { ...state.call, isMuted: muted } } : state,
      ),

    setPendingOutboundAnswer: (data) => set({ pendingOutboundAnswer: data }),

    clearPendingOutboundAnswer: () => set({ pendingOutboundAnswer: null }),

    // Guarded on an actual value change (not just `state.call` truthiness):
    // once `ended` lingers in the store instead of nulling immediately, the
    // teardown effect's unconditional `setRecording(false)` on every
    // `ended`/unmount pass would otherwise always produce a NEW call object
    // — even when `isRecording` was already `false` — which re-triggers the
    // same effect via the store subscription and loops forever.
    setRecording: (recording) =>
      set((state) =>
        state.call && state.call.isRecording !== recording
          ? { call: { ...state.call, isRecording: recording } }
          : state,
      ),

    reset: () => set({ call: null }),

    handleEnded: (whatsappCallId, status = "completed") =>
      set((state) =>
        state.call?.whatsappCallId === whatsappCallId
          ? {
              call: {
                ...state.call,
                phase: WhatsappVoipCallPhase.ended,
                endedStatus: status,
              },
            }
          : state,
      ),
  }),
)
