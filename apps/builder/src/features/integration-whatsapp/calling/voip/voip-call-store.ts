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
 * `connectionLost` is client-only (R5): set when the local
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

type WhatsappVoipCallState = {
  /** At most one VoIP call at a time — offers are targeted to one reserved
   * agent, and inbound/outbound stay mutually exclusive in this one slot. */
  call: WhatsappVoipCall | null
  pendingOutboundAnswer: WhatsappVoipPendingOutboundAnswer | null
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
  markActive: (whatsappCallId: string) => void
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
    pendingOutboundAnswer: null,

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
        if (status === "ringing") {
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

    markActive: (whatsappCallId) =>
      set((state) =>
        state.call?.whatsappCallId === whatsappCallId
          ? {
              call: {
                ...state.call,
                phase: WhatsappVoipCallPhase.active,
                startedAt: Date.now(),
              },
            }
          : state,
      ),

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
