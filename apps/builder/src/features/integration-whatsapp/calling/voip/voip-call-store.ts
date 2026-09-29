"use client"

import { create } from "zustand"

/**
 * Inbound: `incomingRinging` -> `answering` -> `active` -> `ended`. Outbound:
 * `preparing` (local nonce) -> `outboundDialing` -> `outboundRinging` ->
 * `active` -> `ended`, driven by Meta's status events, not `pc.connectionState`.
 * `ended` lingers briefly so the panel can show a final message.
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

/** Mirrors `WhatsappCall.direction`. */
export const WhatsappVoipCallDirection = {
  inbound: "inbound",
  outbound: "outbound",
} as const
export type WhatsappVoipCallDirection =
  (typeof WhatsappVoipCallDirection)[keyof typeof WhatsappVoipCallDirection]

/**
 * Why the call ended, for the panel's final message. `connectionLost` is
 * client-only — set when the peer connection fails. The rest below it are the
 * ways answering an incoming call can fail, each named so the agent is told
 * why instead of the ring simply vanishing.
 */
export type WhatsappVoipEndedStatus =
  | "completed"
  | "rejected"
  | "failed"
  | "connectionLost"
  /** Another agent answered first, the answer window closed, or access was lost. */
  | "cannotAnswer"
  /** The caller hung up before the answer connected. */
  | "callEnded"
  /** The browser refused microphone access. */
  | "micPermissionDenied"
  /** No microphone device is available. */
  | "micNotFound"
  /** Anything else — the agent is pointed at their microphone and connection. */
  | "answerFailed"

/**
 * Ended states that explain a failure the agent has to read and act on. They
 * stay on screen until dismissed; the rest clear after the usual short linger,
 * which is too brief to read a sentence like "connect a microphone".
 */
export const STICKY_ENDED_STATUSES: ReadonlySet<WhatsappVoipEndedStatus> =
  new Set<WhatsappVoipEndedStatus>([
    "cannotAnswer",
    "callEnded",
    "micPermissionDenied",
    "micNotFound",
    "answerFailed",
  ])

/**
 * Which step of `startOutbound` is in flight, for the preparing status line.
 */
export type WhatsappVoipPreparingStage = "turn" | "mic" | "offer" | "initiate"

export type WhatsappVoipCall = {
  transport: "voip"
  /**
   * The local nonce while `preparing`; the server `WhatsappCall.id` otherwise.
   */
  whatsappCallId: string
  /** Empty string placeholder while `phase === "preparing"`. */
  wacid: string
  phase: WhatsappVoipCallPhase
  direction: WhatsappVoipCallDirection
  conversationId: string
  contactInboxId: string
  contactName?: string | null
  /** Inbound only — the offer to answer. */
  offer?: { sdpType: "offer"; sdp: string }
  /**
   * Correlates the async SDP answer and status events to this outbound call;
   * the local nonce until `upgradeToDialing`.
   */
  attemptId?: string
  deadlineAt: string
  isMuted: boolean
  /**
   * "Recording requested" — from the initiate/answer result, not from whether a
   * browser recorder started (Meta may record server-side).
   */
  isRecording: boolean
  startedAt?: number
  /** Which final message to show; set by `handleEnded`. */
  endedStatus?: WhatsappVoipEndedStatus
  /**
   * The server's own reason, already localized, when it gave a specific one.
   * Shown in place of the `endedStatus` sentence.
   */
  endedMessage?: string
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
 * A call offered to this agent but not yet answered. Pure data — no peer, mic
 * or timer — until `promoteRinging` moves it into the `call` slot. An id is
 * never in both the basket and the slot.
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
  /** Whether the browser recorder should capture — never under `metaNative`. */
  browserRecordingEnabled: boolean
  /** Whether any recording was requested (Meta or browser). */
  recordingRequested: boolean
}

export type WhatsappVoipPreparingData = {
  conversationId: string
  contactInboxId: string
  contactName?: string | null
}

/**
 * Outbound SDP answer handed from `chat-realtime.tsx` to the hook, kept apart
 * from `call` so an answer for a call no longer held can be dropped.
 */
export type WhatsappVoipPendingOutboundAnswer = {
  whatsappCallId: string
  sdp: string
}

/**
 * Whether the call slot can take a new call. A lingering `ended` call counts as
 * free. The single definition every consumer uses.
 */
export function isCallSlotFree(call: WhatsappVoipCall | null): boolean {
  return !call || call.phase === WhatsappVoipCallPhase.ended
}

/**
 * Where an outbound call lands when Meta's status arrived before its real id
 * did.
 */
/** How long a `pendingConversationOpen` request stays valid. */
export const PENDING_CONVERSATION_OPEN_MAX_AGE_MS = 15_000

const OUTBOUND_PHASE_BY_BUFFERED_STATUS: Record<
  "ringing" | "accepted",
  WhatsappVoipCallPhase
> = {
  ringing: WhatsappVoipCallPhase.outboundRinging,
  accepted: WhatsappVoipCallPhase.active,
}

type WhatsappVoipCallState = {
  /**
   * The one call this agent is engaged with (inbound or outbound). Other
   * pending offers live in `ringingCalls`.
   */
  call: WhatsappVoipCall | null
  /** Offers not yet answered, in arrival order. Never overlaps `call`. */
  ringingCalls: WhatsappVoipRingingCall[]
  /**
   * A conversation to open while already on the inbox (from the panel's "Go to
   * conversation" or navigate-on-answer) — a plain `router.push` would not re-
   * run the list's bootstrap. Lives here so both the calling layer and the chat
   * feature can reach it without shared context. Timestamped so a stale request
   * is never honored by a later inbox mount.
   */
  pendingConversationOpen: {
    conversationId: string
    requestedAt: number
  } | null
  pendingOutboundAnswer: WhatsappVoipPendingOutboundAnswer | null
  /**
   * Adds a ring to the basket; a redelivery (already in the basket or the slot)
   * is ignored.
   */
  enqueueRinging: (data: WhatsappVoipIncomingData) => void
  /** Drops a basket entry by id. A no-op when the id is not present. */
  removeRinging: (whatsappCallId: string) => void
  /**
   * Stops a ring answered somewhere else: drops the basket entry and clears the
   * slot while it still holds that call in `incomingRinging`. A tab already
   * past `incomingRinging` is the one answering, so it is left alone. Silent -
   * losing the race is not a terminal event for this tab.
   */
  dismissRinging: (whatsappCallId: string) => void
  /**
   * Drops every basket entry for the given conversations in one update — used
   * when a ringing conversation is reassigned away.
   */
  removeRingingByConversationIds: (conversationIds: readonly string[]) => void
  /**
   * Records a conversation to open while on the inbox, stamped with
   * `Date.now()`.
   */
  setPendingConversationOpen: (conversationId: string) => void
  /**
   * Reads and clears the pending request atomically; returns the id only while
   * still fresh.
   */
  consumePendingConversationOpen: (now?: number) => string | null
  /**
   * Moves one basket entry into the call slot. `false` (nothing changed) when
   * the id is not in the basket or the slot is engaged.
   */
  promoteRinging: (whatsappCallId: string) => boolean
  /** Empties the basket. Does not touch the `call` slot. */
  clearRinging: () => void
  addOutbound: (data: WhatsappVoipOutboundData) => void
  /**
   * Claims the slot immediately with the client nonce so the panel renders on
   * click. No-op while occupied.
   */
  startPreparing: (attemptId: string, data: WhatsappVoipPreparingData) => void
  /** Updates the preparing step indicator. */
  setPreparingStage: (
    attemptId: string,
    stage: WhatsappVoipPreparingStage,
  ) => void
  /**
   * `preparing` -> `outboundDialing` once the initiate action returns a real
   * call; no-op if the attempt was released meanwhile.
   */
  upgradeToDialing: (attemptId: string, data: WhatsappVoipOutboundData) => void
  /**
   * Releases a `preparing` slot — on cancel, or when the dial did not produce a
   * call.
   */
  releasePreparing: (attemptId: string) => void
  setPhase: (whatsappCallId: string, phase: WhatsappVoipCallPhase) => void
  /**
   * Meta's outbound status for a call whose id is not in the slot yet (Meta can
   * send ACCEPTED before the initiate action returns). Applied by
   * `upgradeToDialing`; dropping it would leave the agent's mic detached.
   */
  pendingOutboundStatus: {
    whatsappCallId: string
    status: "ringing" | "accepted"
  } | null
  setOutboundStatus: (
    whatsappCallId: string,
    status: "ringing" | "accepted",
  ) => void
  /**
   * Moves the matching call to `active`. Refuses (returns `false`) when the id
   * does not match or the call already `ended`, so no caller can resurrect a
   * finished call.
   */
  markActive: (whatsappCallId: string) => boolean
  setMuted: (muted: boolean) => void
  setRecording: (recording: boolean) => void
  setPendingOutboundAnswer: (data: WhatsappVoipPendingOutboundAnswer) => void
  clearPendingOutboundAnswer: () => void
  reset: () => void
  /**
   * Moves the call to the lingering `ended` phase; `status` defaults to
   * `"completed"`.
   */
  handleEnded: (
    whatsappCallId: string,
    status?: WhatsappVoipEndedStatus,
    message?: string,
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
        // Already promoted — never re-add it to the basket.
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

    dismissRinging: (whatsappCallId) =>
      set((state) => {
        const nextRingingCalls = state.ringingCalls.filter(
          (ringing) => ringing.whatsappCallId !== whatsappCallId,
        )
        const isSlotRinging =
          state.call?.whatsappCallId === whatsappCallId &&
          state.call.phase === WhatsappVoipCallPhase.incomingRinging
        if (
          !isSlotRinging &&
          nextRingingCalls.length === state.ringingCalls.length
        ) {
          return state
        }
        return {
          ringingCalls: nextRingingCalls,
          ...(isSlotRinging && { call: null }),
        }
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

    // Decide and write inside one synchronous `set` so the decision cannot go
    // stale; `promoted` carries the result out.
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

    // Keeps inbound and outbound exclusive in the one slot.
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
            // Unused placeholder — the deadline backstop skips `preparing`.
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
        // Apply a status Meta sent before the id reached the slot.
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
          // Not the slot's call yet (still a nonce) — buffer for
          // `upgradeToDialing`. `accepted` is never downgraded by a later
          // `ringing`.
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
        // Meta's outbound statuses are unordered: never move a call backwards
        // (a late RINGING would re-arm the deadline mid-conversation) or revive
        // an `ended` one.
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

    // Only write on a real change — otherwise the teardown effect's
    // `setRecording(false)` would create a new call object each pass and loop.
    setRecording: (recording) =>
      set((state) =>
        state.call && state.call.isRecording !== recording
          ? { call: { ...state.call, isRecording: recording } }
          : state,
      ),

    reset: () => set({ call: null }),

    handleEnded: (whatsappCallId, status, message) =>
      set((state) =>
        state.call?.whatsappCallId === whatsappCallId
          ? {
              call: {
                ...state.call,
                phase: WhatsappVoipCallPhase.ended,
                endedStatus: status ?? "completed",
                endedMessage: message,
              },
            }
          : state,
      ),
  }),
)
