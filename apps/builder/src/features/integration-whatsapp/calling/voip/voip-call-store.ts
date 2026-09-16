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
 * the identical rule inlined in `addIncoming` below). Factored out as a
 * standalone helper — and exported — so every consumer of this rule
 * (`promoteRinging` here, plus `WhatsappCallPanel`'s `isSlotFree` and the
 * `slotIsEngaged` checks in `useWhatsappVoipCall`'s `answer()` and
 * `WhatsappVoipCallProvider`) shares the ONE definition instead of
 * re-deriving it inline in four places that would silently drift the moment
 * a new terminal phase is added. `addIncoming`/`addOutbound`/`startPreparing`
 * keep their own inline checks as-is, since this slice only ADDS to the
 * store and does not touch the 14 existing mutations. */
export function isCallSlotFree(call: WhatsappVoipCall | null): boolean {
  return !call || call.phase === WhatsappVoipCallPhase.ended
}

type WhatsappVoipCallState = {
  /** At most one VoIP call at a time — offers are targeted to one reserved
   * agent, and inbound/outbound stay mutually exclusive in this one slot. */
  call: WhatsappVoipCall | null
  /** Calls OFFERED to this agent but not yet answered — see
   * `WhatsappVoipRingingCall`. Ordered by arrival (append-only, dropped by
   * id). Disjoint from `call` at all times — see the invariant documented
   * on `WhatsappVoipRingingCall`. */
  ringingCalls: WhatsappVoipRingingCall[]
  pendingOutboundAnswer: WhatsappVoipPendingOutboundAnswer | null
  /** Appends a new ring to the basket. A no-op when redelivered: either the
   * id is already sitting in the basket, or it is the id currently occupying
   * the `call` slot (already promoted, so no longer merely "offered") —
   * either way a duplicate row must never appear. */
  enqueueRinging: (data: WhatsappVoipIncomingData) => void
  /** Drops a basket entry by id. A no-op when the id is not present. */
  removeRinging: (whatsappCallId: string) => void
  /** Atomically moves one basket entry into the single `call` slot, shaped
   * exactly like `addIncoming`'s result (phase `incomingRinging`,
   * `isMuted`/`isRecording` false). Returns `true` on success; `false` when
   * the id is not in the basket, or the slot is occupied by a call that is
   * not free (see `isCallSlotFree` — a lingering `ended` call IS free). On
   * `false` the basket and slot are both left untouched. */
  promoteRinging: (whatsappCallId: string) => boolean
  /** Empties the basket. Does not touch the `call` slot. */
  clearRinging: () => void
  addIncoming: (data: WhatsappVoipIncomingData) => void
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
  (set) => ({
    call: null,
    ringingCalls: [],
    pendingOutboundAnswer: null,

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

    addIncoming: (data) =>
      set((state) => {
        // Accept a new incoming offer ONLY when the slot is free, or when it is
        // a redelivery of the SAME call that is still merely ringing (a
        // harmless idempotent refresh). Any call already past `incomingRinging`
        // — including the same call now `answering`/`active` — is left
        // untouched: overwriting it would reset the phase and orphan the live
        // `RTCPeerConnection` the hook holds (a leaked peer + mic). A second,
        // different offer that lands while one is in progress is dropped on
        // this agent and Meta-rejected server-side when it expires.
        //
        // While an outbound dial is `preparing`, the slot is ALREADY ours
        // (claimed instantly on click, before any server call exists) — an
        // inbound ring landing in that window is dropped here too, exactly
        // like it would be against any other in-progress call. Accepted
        // trade-off.
        const existing = state.call
        const isSameRinging =
          existing?.whatsappCallId === data.whatsappCallId &&
          existing?.phase === WhatsappVoipCallPhase.incomingRinging
        // A lingering `ended` call is FREE, not occupied — it is only
        // still in the slot so the panel can show its terminal message for
        // ~2s; a new inbound ring must be able to claim the slot immediately
        // rather than being dropped for up to 2s after the previous call
        // ended.
        const isFree =
          !existing || existing.phase === WhatsappVoipCallPhase.ended
        if (!(isFree || isSameRinging)) {
          return state
        }
        return {
          call: {
            ...data,
            transport: "voip",
            direction: WhatsappVoipCallDirection.inbound,
            phase: WhatsappVoipCallPhase.incomingRinging,
            isMuted: false,
            isRecording: false,
          },
        }
      }),

    // Mirrors `addIncoming`'s single-slot guard so inbound and outbound stay
    // mutually exclusive: a no-op while the slot is occupied by any other
    // in-progress call (the hook's `startOutbound` also short-circuits
    // before this is ever reached, but the guard here keeps the store itself
    // safe against any other caller).
    addOutbound: (data) =>
      set((state) => {
        // A lingering `ended` call is FREE, not occupied — see
        // `addIncoming`.
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
        // `addIncoming`.
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
        if (
          state.call?.whatsappCallId !== whatsappCallId ||
          state.call.direction !== WhatsappVoipCallDirection.outbound
        ) {
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
