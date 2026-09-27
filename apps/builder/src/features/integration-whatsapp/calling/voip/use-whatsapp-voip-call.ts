"use client"

import { useTranslations } from "next-intl"
import { DEFAULT_SERVER_ERROR_MESSAGE } from "next-safe-action"
import type { RefObject } from "react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { logger } from "@/lib/log"
import {
  type AnswerWhatsappVoipCallResult,
  answerWhatsappVoipCallAction,
} from "../actions/answer-voip-call.action"
import { getPendingIncomingVoipCallAction } from "../actions/get-pending-incoming-voip-call.action"
import { hangupWhatsappVoipCallAction } from "../actions/hangup-voip-call.action"
import { heartbeatActiveVoipCallAction } from "../actions/heartbeat-active-voip-call.action"
import type { InitiateOutboundVoipCallResult } from "../actions/initiate-outbound-voip-call.action"
import { initiateOutboundVoipCallAction } from "../actions/initiate-outbound-voip-call.action"
import { outboundVoipTurnCredentialsAction } from "../actions/outbound-voip-turn-credentials.action"
import { getWhatsappVoipTurnCredentialsAction } from "../actions/voip-turn-credentials.action"
import { type CallRecorder, startCallRecorder } from "./call-recorder"
import { type AnswerLockOutcome, runWithAnswerLock } from "./cross-tab-answer"
import {
  isCallSlotFree,
  STICKY_ENDED_STATUSES,
  useWhatsappVoipCallStore,
  type WhatsappVoipCall,
  WhatsappVoipCallDirection,
  WhatsappVoipCallPhase,
  type WhatsappVoipEndedStatus,
} from "./voip-call-store"
import {
  attachMicrophone,
  captureMicrophoneStream,
  createOutboundOffer,
  type MicrophoneCaptureFailure,
  registerConnectionHealthHandlers,
  waitForIceGatheringComplete,
} from "./voip-peer-connection"

/**
 * Cap on how long an outbound dial may stay `preparing` — bounds a hung TURN
 * fetch or an unanswered mic prompt.
 */
const PREPARING_TIMEOUT_MS = 30_000

/** How long the `ended` phase stays visible before the slot auto-clears. */
const ENDED_LINGER_MS = 2000

/** What the panel says when answering reached the server but did not connect. */
const ENDED_STATUS_BY_ANSWER_OUTCOME = {
  cannotAnswer: "cannotAnswer",
  callEnded: "callEnded",
} as const satisfies Record<
  Exclude<AnswerWhatsappVoipCallResult["outcome"], "accepted">,
  WhatsappVoipEndedStatus
>

/**
 * What the panel says when the microphone could not be captured. An
 * unrecognised capture failure points the agent at their device, never at a
 * vague "try again".
 */
const ENDED_STATUS_BY_MICROPHONE_FAILURE = {
  micPermissionDenied: "micPermissionDenied",
  micNotFound: "micNotFound",
  callFailed: "answerFailed",
} as const satisfies Record<MicrophoneCaptureFailure, WhatsappVoipEndedStatus>

/**
 * The server's reason, when it gave a specific one. The generic default says
 * nothing the "check your microphone" fallback does not, so it is dropped in
 * favour of that.
 */
const specificServerReason = (
  serverError: string | undefined,
): string | undefined =>
  serverError && serverError !== DEFAULT_SERVER_ERROR_MESSAGE
    ? serverError
    : undefined

/**
 * Best-effort hangup beacon on tab close while a call is `active`, so Meta's
 * leg is not left in dead air. `pagehide` fires on both unload and bfcache; a
 * plain route because `sendBeacon` cannot post a server action. Unreliable by
 * nature — the server-side expiry is the real backstop.
 */
const VOIP_CALL_HANGUP_BEACON_URL = "/api/whatsapp-voip-call-hangup"

/**
 * Heartbeat cadence while a call is `active`, so a lost `terminate` webhook can
 * still be swept. Matches `PRESENCE_REPORT_INTERVAL_MS`.
 */
const ACTIVE_CALL_HEARTBEAT_INTERVAL_MS = 20_000

/**
 * Fallback expiry for a ringing offer with an unparseable `deadlineAt` — past
 * Meta's ~55s TTL so it never cuts a live offer short, but a dead ring still
 * clears if the ended event is lost.
 */
const RING_FALLBACK_EXPIRY_MS = 90_000

/**
 * Phases where leaving the tab drops a call the agent is engaged in.
 * `incomingRinging` is excluded: an unanswered offer survives a reload.
 */
const LEAVE_CONFIRMATION_PHASES = new Set<WhatsappVoipCallPhase>([
  WhatsappVoipCallPhase.answering,
  WhatsappVoipCallPhase.outboundDialing,
  WhatsappVoipCallPhase.outboundRinging,
  WhatsappVoipCallPhase.active,
])

/** Explicit echo cancellation, noise suppression and auto gain — `audio: true` doesn't reliably enable them across browsers. */
/** Result of an outbound dial: every server outcome plus the local-only `"occupied"` (the call slot is busy). */
export type StartOutboundOutcome =
  | InitiateOutboundVoipCallResult["outcome"]
  | "occupied"
  /**
   * The agent cancelled while the dial was still `preparing` — silent, the
   * panel already closed.
   */
  | "cancelled"
  /** `getUserMedia` rejected with `NotAllowedError`. */
  | "micPermissionDenied"
  /** `getUserMedia` rejected with `NotFoundError` — no microphone device. */
  | "micNotFound"

export type StartOutboundParams = {
  conversationId: string
  contactInboxId?: string
  contactName?: string | null
}

export type UseWhatsappVoipCallResult = {
  /** Attach to an `<audio autoPlay>` element to play the remote party's media. */
  remoteAudioRef: RefObject<HTMLAudioElement | null>
  /**
   * Answers an incoming call. With no id, targets the slot's call; with an id,
   * a specific basket entry, ending the current call first if needed.
   */
  answer: (whatsappCallId?: string) => Promise<void>
  /**
   * Silences a ring locally only (ring-all: it keeps ringing for others). A
   * basket entry owns no peer or mic, so nothing is torn down.
   */
  dismiss: (whatsappCallId?: string) => void
  /**
   * Ends an active call, cancels an outbound call that is
   * preparing/dialing/ringing, or dismisses an `ended` call.
   */
  hangup: () => Promise<void>
  /** Toggles the local microphone track's `enabled` flag. */
  toggleMute: () => void
  /** Clears a lingering `ended` call without waiting for the auto-dismiss. */
  dismissEnded: () => void
  /**
   * Places an outbound call: builds the SDP offer locally, then calls
   * `initiateOutboundVoipCallAction`. Returns `"occupied"` while the slot holds
   * another call.
   */
  startOutbound: (params: StartOutboundParams) => Promise<StartOutboundOutcome>
}

/**
 * Browser WebRTC peer for WhatsApp calls, driven by `useWhatsappVoipCallStore`.
 * Incoming offers land in the `ringingCalls` basket; `answer` promotes one into
 * the single call slot. The peer and mic are torn down on every exit path so
 * neither leaks.
 */
export function useWhatsappVoipCall(): UseWhatsappVoipCallResult {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const call = useWhatsappVoipCallStore((state) => state.call)
  const ringingCalls = useWhatsappVoipCallStore((state) => state.ringingCalls)
  const enqueueRinging = useWhatsappVoipCallStore(
    (state) => state.enqueueRinging,
  )
  const removeRinging = useWhatsappVoipCallStore((state) => state.removeRinging)
  // Read via `getState()` so every decision sees fresh state, not a render
  // snapshot.
  const clearRinging = useWhatsappVoipCallStore((state) => state.clearRinging)
  const setPhase = useWhatsappVoipCallStore((state) => state.setPhase)
  const markActive = useWhatsappVoipCallStore((state) => state.markActive)
  const setMutedInStore = useWhatsappVoipCallStore((state) => state.setMuted)
  const setRecordingInStore = useWhatsappVoipCallStore(
    (state) => state.setRecording,
  )
  const handleEnded = useWhatsappVoipCallStore((state) => state.handleEnded)
  const reset = useWhatsappVoipCallStore((state) => state.reset)
  const startPreparing = useWhatsappVoipCallStore(
    (state) => state.startPreparing,
  )
  const setPreparingStage = useWhatsappVoipCallStore(
    (state) => state.setPreparingStage,
  )
  const upgradeToDialing = useWhatsappVoipCallStore(
    (state) => state.upgradeToDialing,
  )
  const releasePreparing = useWhatsappVoipCallStore(
    (state) => state.releasePreparing,
  )
  const pendingOutboundAnswer = useWhatsappVoipCallStore(
    (state) => state.pendingOutboundAnswer,
  )
  const clearPendingOutboundAnswer = useWhatsappVoipCallStore(
    (state) => state.clearPendingOutboundAnswer,
  )
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const resumeFetchedRef = useRef(false)
  const recorderRef = useRef<CallRecorder | null>(null)
  /**
   * Whether the browser recorder may start for this call — never under
   * `metaNative`, where Meta records server-side.
   */
  const shouldRecordRef = useRef(false)
  /**
   * Cancel token for a `preparing` dial. If the dial still resolves to a real
   * server call after cancellation, `startOutbound` fires a compensating
   * hangup.
   */
  const cancelledAttemptIdRef = useRef<string | null>(null)
  /** Serializes `answer()` — holds the id being answered, `null` otherwise. */
  const answeringIdRef = useRef<string | null>(null)
  /**
   * False after unmount. Checked after each await in `answerIncoming`: the
   * unmount teardown only sees resources that existed at that moment, so a
   * continuation that builds a peer or mic afterwards must clean up itself.
   */
  const isMountedRef = useRef(true)

  // Resume after refresh: a ring is delivered once over realtime, so an agent
  // who reloads mid-ring would lose it while it is still answerable. Runs once
  // per mount. Every outstanding offer goes into the basket even while the slot
  // is busy — `enqueueRinging` ignores duplicates and each entry's timer drops
  // it once expired.
  useEffect(() => {
    if (resumeFetchedRef.current || !workspaceId) {
      return
    }
    resumeFetchedRef.current = true

    getPendingIncomingVoipCallAction(workspaceId)
      .then((result) => {
        const pending = result?.data ?? []
        // The server returns newest first; reverse so the basket keeps the same
        // arrival order as live rings.
        for (const pendingCall of [...pending].reverse()) {
          // Moving the ringing conversation to the top is `ChatRealtime`'s job
          // (it watches the basket), so this hook needs no `ChatStore`.
          enqueueRinging(pendingCall)
        }
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error },
          "WhatsApp VoIP resume-after-refresh lookup failed",
        )
      })
  }, [workspaceId, enqueueRinging])

  // Expiry for basket entries (which own no timer). Keyed on an `id:deadlineAt`
  // fingerprint rather than the array, so unrelated enqueues do not tear down
  // and re-arm every surviving timer.
  const ringingFingerprint = useMemo(
    () =>
      ringingCalls
        .map((entry) => `${entry.whatsappCallId}:${entry.deadlineAt}`)
        .join(","),
    [ringingCalls],
  )
  // `ringingFingerprint` is the intentional re-arm trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ringingFingerprint substitutes for ringingCalls on purpose
  useEffect(() => {
    const timeoutIds = ringingCalls.flatMap((entry) => {
      const deadlineMs = new Date(entry.deadlineAt).getTime()
      // An unparseable deadline would make the delay NaN and fire immediately;
      // skipping the timer would strand the ring if the ended event is lost.
      // Use a bounded fallback instead.
      const isDeadlineUsable = Number.isFinite(deadlineMs)
      if (!isDeadlineUsable) {
        logger.warn(
          { whatsappCallId: entry.whatsappCallId },
          "WhatsApp VoIP ring has an unparseable deadline; falling back to a bounded local expiry",
        )
      }
      const delayMs = isDeadlineUsable
        ? Math.max(deadlineMs - Date.now(), 0)
        : RING_FALLBACK_EXPIRY_MS
      return setTimeout(() => removeRinging(entry.whatsappCallId), delayMs)
    })
    return () => {
      for (const timeoutId of timeoutIds) {
        clearTimeout(timeoutId)
      }
    }
  }, [ringingFingerprint, removeRinging])

  // Clear the basket on unmount — its timers die with the effect, and stale
  // offers could never expire otherwise.
  useEffect(() => clearRinging, [clearRinging])

  const teardown = useCallback(() => {
    // Stop the recorder before the tracks: `stop` flushes the last chunk
    // synchronously, the upload runs later in `onstop`.
    recorderRef.current?.stop()
    recorderRef.current = null
    shouldRecordRef.current = false
    remoteStreamRef.current = null
    setRecordingInStore(false)

    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    for (const track of localStreamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    localStreamRef.current = null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
  }, [setRecordingInStore])

  /**
   * Handles an unrecoverable connection. An accepted call still needs a server-
   * side hangup so Meta's leg ends; a `preparing` dial only releases the slot.
   * Idempotent — `failed` can fire more than once.
   */
  const handleConnectionLost = useCallback(() => {
    const current = useWhatsappVoipCallStore.getState().call
    teardown()
    if (!current || current.phase === WhatsappVoipCallPhase.ended) {
      return
    }
    if (current.phase === WhatsappVoipCallPhase.preparing) {
      releasePreparing(current.whatsappCallId)
      return
    }
    if (!workspaceId) {
      reset()
      return
    }
    const { whatsappCallId } = current
    handleEnded(whatsappCallId, "connectionLost")
    hangupWhatsappVoipCallAction(workspaceId, { whatsappCallId }).catch(
      (error: unknown) => {
        logger.error(
          { err: error, whatsappCallId },
          "WhatsApp VoIP connection-lost compensating hangup failed",
        )
      },
    )
  }, [teardown, handleEnded, releasePreparing, reset, workspaceId])

  /**
   * Starts the browser recorder once the mic, the remote track and
   * `browserRecordingEnabled` are all present; whichever arrives last calls
   * this. The panel's recording indicator follows `recordingRequested` instead,
   * since Meta may record server-side.
   */
  const maybeStartRecorder = useCallback(
    (whatsappCallId: string) => {
      if (
        !shouldRecordRef.current ||
        recorderRef.current ||
        !localStreamRef.current ||
        !remoteStreamRef.current
      ) {
        return
      }
      recorderRef.current = startCallRecorder({
        whatsappCallId,
        localStream: localStreamRef.current,
        remoteStream: remoteStreamRef.current,
      })
      if (recorderRef.current) {
        setRecordingInStore(true)
      }
    },
    [setRecordingInStore],
  )

  /**
   * Builds the peer both directions use. They differ only in which call id the
   * recorder starts against — outbound has none until it leaves `preparing`.
   */
  const createCallPeerConnection = useCallback(
    (
      iceServers: RTCIceServer[],
      resolveRecorderCallId: () => string | undefined,
    ): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers })
      peerConnectionRef.current = pc
      registerConnectionHealthHandlers(pc, handleConnectionLost)
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams
        if (remoteAudioRef.current && remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream
        }
        if (!remoteStream) {
          return
        }
        remoteStreamRef.current = remoteStream
        const recorderCallId = resolveRecorderCallId()
        if (recorderCallId) {
          maybeStartRecorder(recorderCallId)
        }
      }
      return pc
    },
    [handleConnectionLost, maybeStartRecorder],
  )

  // Tear the peer down whenever the store says the call is over, including when
  // an external `handleEnded` cleared it. Includes `ended`: the card lingers,
  // the media must not.
  useEffect(() => {
    if (!call || call.phase === WhatsappVoipCallPhase.ended) {
      teardown()
    }
  }, [call, teardown])

  // Auto-clear an `ended` call after the linger — but only if the slot still
  // holds that same call, since `ended` counts as free and may already be
  // replaced.
  useEffect(() => {
    if (
      call?.phase !== WhatsappVoipCallPhase.ended ||
      // A failure the agent has to read stays until they dismiss it.
      (call.endedStatus && STICKY_ENDED_STATUSES.has(call.endedStatus))
    ) {
      return
    }
    const { whatsappCallId } = call
    const timeoutId = setTimeout(() => {
      if (
        useWhatsappVoipCallStore.getState().call?.whatsappCallId ===
        whatsappCallId
      ) {
        reset()
      }
    }, ENDED_LINGER_MS)
    return () => clearTimeout(timeoutId)
  }, [call, reset])

  // Unmount safety net — never leak a peer or a live mic track.
  useEffect(() => teardown, [teardown])

  // Lets an in-flight `answerIncoming` notice an unmount after it resumes from
  // an await.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Applies the outbound SDP answer handed over by `chat-realtime.tsx`. Meta
  // sends it right after initiation, so it can arrive before the call exists
  // locally (or while it still has its client nonce) — buffer until it matches.
  // Drop it if the peer is gone or a different call now holds the slot.
  useEffect(() => {
    if (!pendingOutboundAnswer) {
      return
    }
    const pc = peerConnectionRef.current
    const isPreparing = call?.phase === WhatsappVoipCallPhase.preparing
    const matchesCurrentCall =
      call?.direction === WhatsappVoipCallDirection.outbound &&
      !isPreparing &&
      call.whatsappCallId === pendingOutboundAnswer.whatsappCallId

    if (matchesCurrentCall) {
      if (!pc) {
        clearPendingOutboundAnswer()
        return
      }
      pc.setRemoteDescription({
        type: "answer",
        sdp: pendingOutboundAnswer.sdp,
      }).catch((error: unknown) => {
        logger.error(
          { err: error, whatsappCallId: call.whatsappCallId },
          "WhatsApp outbound VoIP setRemoteDescription(answer) failed",
        )
      })
      clearPendingOutboundAnswer()
      return
    }

    if (call && !isPreparing) {
      // A different call holds the slot — this answer's call is gone for good.
      clearPendingOutboundAnswer()
    }
    // No call yet, or still `preparing` — keep buffering.
  }, [pendingOutboundAnswer, call, clearPendingOutboundAnswer])

  // Starts the recorder on the transition to `active` (from Meta's ACCEPTED
  // status), not `pc.connectionState`. Recorder only — the mic is attached when
  // the offer is built so audio never depends on that best-effort event.
  useEffect(() => {
    if (
      call?.direction === WhatsappVoipCallDirection.outbound &&
      call.phase === WhatsappVoipCallPhase.active
    ) {
      maybeStartRecorder(call.whatsappCallId)
    }
  }, [call, maybeStartRecorder])

  /**
   * Ends a failed answer on screen instead of clearing it: releases any media
   * already acquired, then leaves the panel showing why, so the ring never
   * just vanishes.
   */
  const failAnswer = useCallback(
    (
      whatsappCallId: string,
      status: WhatsappVoipEndedStatus,
      message?: string,
    ) => {
      teardown()
      handleEnded(whatsappCallId, status, message)
    },
    [teardown, handleEnded],
  )

  /**
   * Everything after this tab wins the answer lock: TURN, mic, SDP, then the
   * server accept. Every failure ends on screen with its reason.
   */
  const attemptAnswer = useCallback(
    async (whatsappCallId: string, offerSdp: string) => {
      if (!workspaceId) {
        return
      }
      try {
        const turnResult = await getWhatsappVoipTurnCredentialsAction(
          workspaceId,
          { whatsappCallId },
        )
        const credentials = turnResult?.data
        if (!credentials) {
          failAnswer(
            whatsappCallId,
            "answerFailed",
            specificServerReason(turnResult?.serverError),
          )
          return
        }
        if (!credentials.turnConfigured) {
          logger.warn(
            { whatsappCallId },
            "WhatsApp VoIP call answered without a configured TURN server — STUN-only is not sufficient behind hostile NATs in production",
          )
        }

        const pc = createCallPeerConnection(
          credentials.iceServers,
          () => whatsappCallId,
        )

        // Acquire the mic first, so a denial or missing device surfaces before
        // the agent waits out the whole accept round-trip. The same capture the
        // outbound dial uses, so both directions name the same failures.
        const microphone = await captureMicrophoneStream()
        if ("failure" in microphone) {
          if (microphone.error) {
            logger.error(
              { err: microphone.error, whatsappCallId },
              "WhatsApp VoIP answer could not capture the microphone",
            )
          }
          failAnswer(
            whatsappCallId,
            ENDED_STATUS_BY_MICROPHONE_FAILURE[microphone.failure],
          )
          return
        }
        const localStream = microphone.stream
        localStreamRef.current = localStream

        // The provider may have unmounted during the TURN fetch or mic prompt,
        // after the unmount teardown already ran against empty refs. Nothing is
        // accepted server-side yet, so tear down locally and stop.
        if (!isMountedRef.current) {
          teardown()
          return
        }

        // Nothing is accepted yet, so abort — but tell the agent why the ring
        // vanished.
        if (!attachMicrophone(pc, localStream)) {
          logger.error(
            { whatsappCallId },
            "WhatsApp VoIP answer aborted — the microphone yielded no audio track",
          )
          failAnswer(whatsappCallId, "answerFailed")
          return
        }

        await pc.setRemoteDescription({ type: "offer", sdp: offerSdp })

        const answerDescription = await pc.createAnswer()
        await pc.setLocalDescription(answerDescription)
        await waitForIceGatheringComplete(pc)

        // The only answer SDP for this call: the action sends it unchanged to
        // both `pre_accept` and `accept`.
        const sdpAnswer = pc.localDescription?.sdp
        if (!sdpAnswer) {
          throw new Error("voip-local-description-missing")
        }

        const result = await answerWhatsappVoipCallAction(workspaceId, {
          whatsappCallId,
          sdpAnswer,
        })
        const data = result?.data

        if (data?.outcome === "accepted") {
          // Meta has accepted, but the local call may be gone: the slot was
          // cleared or replaced, Meta already ended it, or the provider
          // unmounted. `markActive` refuses the first two and `isMountedRef`
          // catches the last, so all of them share one compensating-hangup
          // path.
          const activated = isMountedRef.current && markActive(whatsappCallId)
          if (!activated) {
            hangupWhatsappVoipCallAction(workspaceId, { whatsappCallId }).catch(
              (error: unknown) => {
                logger.error(
                  { err: error, whatsappCallId },
                  "WhatsApp VoIP compensating hangup failed after the store's call was cleared/ended, or the component unmounted, mid-answer",
                )
              },
            )
            teardown()
            return
          }

          // Media is already negotiated. Only the answering agent reaches this,
          // so losing ring-all agents never start a recorder. The recording
          // indicator follows `recordingRequested`, which covers Meta's server-
          // side recording.
          shouldRecordRef.current = data.browserRecordingEnabled
          setRecordingInStore(data.recordingRequested)
          maybeStartRecorder(whatsappCallId)
          return
        }

        // Could not answer, or the call ended — no media flowed.
        failAnswer(
          whatsappCallId,
          data ? ENDED_STATUS_BY_ANSWER_OUTCOME[data.outcome] : "answerFailed",
          data ? undefined : specificServerReason(result?.serverError),
        )
      } catch (error) {
        logger.error(
          { err: error, whatsappCallId },
          "WhatsApp VoIP answer flow failed",
        )
        failAnswer(whatsappCallId, "answerFailed")
      }
    },
    [
      workspaceId,
      markActive,
      teardown,
      maybeStartRecorder,
      setRecordingInStore,
      createCallPeerConnection,
      failAnswer,
    ],
  )

  /**
   * The answer flow, taking the call as a parameter: `answer` may promote a
   * basket entry and must act on it in the same tick, before React re-renders
   * the `call` closure.
   */
  const answerIncoming = useCallback(
    async (incomingCall: WhatsappVoipCall) => {
      if (
        !workspaceId ||
        incomingCall.phase !== WhatsappVoipCallPhase.incomingRinging ||
        // Unreachable for an `incomingRinging` call — every inbound call has an
        // offer.
        !incomingCall.offer
      ) {
        return
      }
      const { whatsappCallId, offer } = incomingCall
      // Synchronous, before the first await: the claimed-elsewhere dismissal
      // leaves a tab alone once it is past incomingRinging.
      setPhase(whatsappCallId, WhatsappVoipCallPhase.answering)

      let lock: AnswerLockOutcome<void>
      try {
        lock = await runWithAnswerLock(whatsappCallId, () =>
          attemptAnswer(whatsappCallId, offer.sdp),
        )
      } catch (error) {
        // Only the lock request itself can reject - `attemptAnswer` reports
        // its own failures.
        logger.error(
          { err: error, whatsappCallId },
          "WhatsApp VoIP answer lock request failed",
        )
        failAnswer(whatsappCallId, "answerFailed")
        return
      }
      // Another tab of this browser is answering it - that tab shows the call,
      // so this one just stops ringing.
      if (
        !lock.acquired &&
        useWhatsappVoipCallStore.getState().call?.whatsappCallId ===
          whatsappCallId
      ) {
        reset()
      }
    },
    [workspaceId, setPhase, attemptAnswer, failAnswer, reset],
  )

  /**
   * Cancels a `preparing` dial: no server call exists yet. Marks the attempt
   * cancelled (so a late server call gets hung up), tears down, and releases
   * the slot. Shared by `hangup` and `endForReplacement`.
   */
  const cancelPreparingAttempt = useCallback(
    (attemptId: string) => {
      cancelledAttemptIdRef.current = attemptId
      teardown()
      releasePreparing(attemptId)
    },
    [teardown, releasePreparing],
  )

  /**
   * Ends the slot's call so a basket entry can replace it. Unlike `hangup`,
   * waits for the server to confirm before tearing down — otherwise a failure
   * leaves the first customer in dead air. A `preparing` call has only a client
   * nonce the action would reject, so it is cancelled locally.
   */
  const endForReplacement = useCallback(
    async (call: WhatsappVoipCall): Promise<boolean> => {
      if (call.phase === WhatsappVoipCallPhase.preparing) {
        cancelPreparingAttempt(call.whatsappCallId)
        return true
      }
      if (!workspaceId) {
        return false
      }
      const { whatsappCallId } = call
      try {
        const result = await hangupWhatsappVoipCallAction(workspaceId, {
          whatsappCallId,
        })
        if (!result?.data?.hungUp) {
          logger.error(
            { whatsappCallId },
            "WhatsApp VoIP replacement hangup did not confirm success",
          )
          toast.error(t("whatsapp.calls.errors.voipHangupFailed"))
          return false
        }
      } catch (error) {
        logger.error(
          { err: error, whatsappCallId },
          "WhatsApp VoIP replacement hangup failed",
        )
        toast.error(t("whatsapp.calls.errors.voipHangupFailed"))
        return false
      }
      teardown()
      reset()
      return true
    },
    [workspaceId, teardown, reset, t, cancelPreparingAttempt],
  )

  /**
   * Answers one offer — by id, or the slot's call. Reads `getState()` fresh
   * since `promoteRinging` makes this render's `call` stale; `answeringIdRef`
   * makes a second concurrent click a no-op. An engaged call is ended (and
   * confirmed) before a different basket entry is promoted; if ending fails,
   * nothing changes.
   */
  const answer = useCallback(
    async (whatsappCallId?: string) => {
      const state = useWhatsappVoipCallStore.getState()
      const targetId = whatsappCallId ?? state.call?.whatsappCallId
      if (!targetId) {
        return
      }
      if (answeringIdRef.current !== null) {
        return
      }
      answeringIdRef.current = targetId

      try {
        const latest = useWhatsappVoipCallStore.getState()

        // The target is already the slot's ringing call — nothing to replace.
        if (
          latest.call?.whatsappCallId === targetId &&
          latest.call.phase === WhatsappVoipCallPhase.incomingRinging
        ) {
          await answerIncoming(latest.call)
          return
        }

        // Otherwise it must be a basket entry.
        const ringing = latest.ringingCalls.find(
          (entry) => entry.whatsappCallId === targetId,
        )
        if (!ringing) {
          // Answered elsewhere, expired or dismissed meanwhile.
          return
        }

        const current = latest.call
        const slotIsEngaged = !isCallSlotFree(current)
        let endedACallToGetHere = false
        if (slotIsEngaged && current) {
          const ended = await endForReplacement(current)
          if (!ended) {
            return
          }
          endedACallToGetHere = true
        }

        const promoted = useWhatsappVoipCallStore
          .getState()
          .promoteRinging(targetId)
        if (!promoted) {
          // Another agent won or the slot refilled — abort. If we ended a live
          // call to get here, say so plainly.
          if (endedACallToGetHere) {
            logger.warn(
              { whatsappCallId: targetId },
              "WhatsApp VoIP replacement: the incoming call was gone after the current one was ended",
            )
            toast.error(t("whatsapp.calls.errors.callNoLongerRinging"))
          }
          return
        }
        const promotedCall = useWhatsappVoipCallStore.getState().call
        if (promotedCall?.whatsappCallId === targetId) {
          await answerIncoming(promotedCall)
        }
      } finally {
        answeringIdRef.current = null
      }
    },
    [answerIncoming, endForReplacement, t],
  )

  // Ring-all: declining is local only; the offer keeps ringing for others until
  // someone answers, the caller hangs up, or it expires.
  const dismiss = useCallback(
    (whatsappCallId?: string) => {
      if (whatsappCallId) {
        // A basket entry has no peer or mic to tear down.
        removeRinging(whatsappCallId)
        return
      }
      teardown()
      reset()
    },
    [removeRinging, teardown, reset],
  )

  // Also lets an outbound call be cancelled while dialing or ringing — Meta has
  // no separate cancel, so this uses the same hangup action.
  const hangup = useCallback(async () => {
    if (!(call && workspaceId)) {
      return
    }

    // Cancel a dial still `preparing` — see `cancelPreparingAttempt`.
    if (call.phase === WhatsappVoipCallPhase.preparing) {
      cancelPreparingAttempt(call.whatsappCallId)
      return
    }

    // An unanswered outbound call ends with a visible "No answer" via
    // `handleEnded`; an active call resets immediately.
    const isOutboundDialPhase =
      call.direction === WhatsappVoipCallDirection.outbound &&
      (call.phase === WhatsappVoipCallPhase.outboundDialing ||
        call.phase === WhatsappVoipCallPhase.outboundRinging)
    const isHangupable =
      call.phase === WhatsappVoipCallPhase.active || isOutboundDialPhase
    if (!isHangupable) {
      return
    }
    const { whatsappCallId } = call
    teardown()
    if (isOutboundDialPhase) {
      handleEnded(whatsappCallId, "completed")
    } else {
      reset()
    }
    await hangupWhatsappVoipCallAction(workspaceId, { whatsappCallId }).catch(
      (error: unknown) => {
        logger.error(
          { err: error, whatsappCallId },
          "WhatsApp VoIP hangup failed",
        )
      },
    )
  }, [call, workspaceId, teardown, reset, handleEnded, cancelPreparingAttempt])

  /** Clears a lingering `ended` call immediately. */
  const dismissEnded = useCallback(() => {
    reset()
  }, [reset])

  // Client-side deadline backstop, in case the transport-ended event never
  // arrives. Inbound: only while still ringing, never under an in-flight
  // answer. Outbound: goes through `hangup` rather than a local teardown,
  // because Meta's ACCEPTED event can be late or lost and the call may already
  // be live server-side. The server enforces its own expiry regardless.
  useEffect(() => {
    if (!call) {
      return
    }
    const isOutboundDialPhase =
      call.direction === WhatsappVoipCallDirection.outbound &&
      (call.phase === WhatsappVoipCallPhase.outboundDialing ||
        call.phase === WhatsappVoipCallPhase.outboundRinging)
    const isDeadlineArmed =
      call.phase === WhatsappVoipCallPhase.incomingRinging ||
      isOutboundDialPhase
    if (!isDeadlineArmed) {
      return
    }
    const { whatsappCallId } = call
    const msUntilDeadline = new Date(call.deadlineAt).getTime() - Date.now()
    const timeoutId = setTimeout(
      () => {
        if (isOutboundDialPhase) {
          hangup().catch((error: unknown) => {
            logger.error(
              { err: error, whatsappCallId },
              "WhatsApp outbound VoIP deadline hangup failed",
            )
          })
          return
        }
        teardown()
        reset()
      },
      Math.max(msUntilDeadline, 0),
    )
    return () => clearTimeout(timeoutId)
  }, [call, teardown, reset, hangup])

  // Bounds the `preparing` phase. Goes through `hangup` so a dial that still
  // reaches the server gets a compensating hangup.
  useEffect(() => {
    if (call?.phase !== WhatsappVoipCallPhase.preparing) {
      return
    }
    const timeoutId = setTimeout(() => {
      hangup().catch((error: unknown) => {
        logger.error(
          { err: error },
          "WhatsApp outbound VoIP preparing timeout hangup failed",
        )
      })
    }, PREPARING_TIMEOUT_MS)
    return () => clearTimeout(timeoutId)
  }, [call, hangup])

  // Outbound call: the browser generates the SDP offer. Audio only.
  const startOutbound = useCallback(
    async (params: StartOutboundParams): Promise<StartOutboundOutcome> => {
      // Checks only the call slot, never the basket: an unanswered ring must
      // not block dialing someone else.
      if (!workspaceId || useWhatsappVoipCallStore.getState().call) {
        return "occupied"
      }

      // Claim the slot immediately so the panel renders on click;
      // `upgradeToDialing` swaps this nonce for the server id.
      const nonce = crypto.randomUUID()
      startPreparing(nonce, {
        conversationId: params.conversationId,
        contactInboxId: params.contactInboxId ?? "",
        contactName: params.contactName,
      })

      const isCancelled = () => cancelledAttemptIdRef.current === nonce
      const clearCancelToken = () => {
        cancelledAttemptIdRef.current = null
      }
      /**
       * Unwinds a cancelled attempt; `tearDownPeer: false` before a peer exists, since the
       * refs are shared and a stale attempt must never close a newer one's peer.
       */
      // Tear down only while this attempt still owns the shared peer/mic slot (or it's empty).
      const stillOwnsSharedMedia = () => {
        const slotCallId =
          useWhatsappVoipCallStore.getState().call?.whatsappCallId
        return slotCallId === undefined || slotCallId === nonce
      }
      const teardownIfStillOurs = () => {
        if (stillOwnsSharedMedia()) {
          teardown()
        }
      }
      const finishCancelled = ({ tearDownPeer } = { tearDownPeer: true }) => {
        if (tearDownPeer) {
          teardownIfStillOurs()
        }
        clearCancelToken()
        releasePreparing(nonce)
        return "cancelled" as const
      }
      const releaseIfStillPreparing = () => {
        releasePreparing(nonce)
      }

      /**
       * Unwinds after a failed step. If the agent cancelled meanwhile, the
       * result is `"cancelled"` — no failure shown for a dial they abandoned.
       */
      const abandonAttempt = (
        outcome: StartOutboundOutcome,
      ): StartOutboundOutcome => {
        teardownIfStillOurs()
        if (isCancelled()) {
          clearCancelToken()
          return "cancelled"
        }
        releaseIfStillPreparing()
        return outcome
      }

      try {
        setPreparingStage(nonce, "turn")
        const turnResult = await outboundVoipTurnCredentialsAction(
          workspaceId,
          { attemptId: nonce },
        )
        const credentials = turnResult?.data
        if (!credentials) {
          throw new Error("voip-outbound-turn-credentials-unavailable")
        }
        if (!credentials.turnConfigured) {
          logger.warn(
            "WhatsApp outbound VoIP dial started without a configured TURN server — STUN-only is not sufficient behind hostile NATs in production",
          )
        }

        if (isCancelled()) {
          // No peer yet — tearing down would hit a newer attempt's shared refs.
          return finishCancelled({ tearDownPeer: false })
        }

        const pc = createCallPeerConnection(credentials.iceServers, () => {
          const activeCall = useWhatsappVoipCallStore.getState().call
          return activeCall &&
            activeCall.phase !== WhatsappVoipCallPhase.preparing
            ? activeCall.whatsappCallId
            : undefined
        })

        setPreparingStage(nonce, "mic")
        const microphone = await captureMicrophoneStream()
        if ("failure" in microphone) {
          if (microphone.error !== undefined) {
            logger.error(
              { err: microphone.error },
              "WhatsApp outbound VoIP getUserMedia failed",
            )
          }
          return abandonAttempt(microphone.failure)
        }
        localStreamRef.current = microphone.stream

        // Before the offer is built — see `attachMicrophone`.
        if (!attachMicrophone(pc, microphone.stream)) {
          logger.error(
            "WhatsApp outbound VoIP dial aborted — the microphone yielded no audio track",
          )
          return abandonAttempt("callFailed")
        }

        if (isCancelled()) {
          return finishCancelled()
        }

        setPreparingStage(nonce, "offer")
        const sdpOffer = await createOutboundOffer(pc, {
          preferRelay: credentials.turnConfigured,
        })

        setPreparingStage(nonce, "initiate")
        const result = await initiateOutboundVoipCallAction(workspaceId, {
          conversationId: params.conversationId,
          contactInboxId: params.contactInboxId,
          sdpOffer,
        })
        const data = result?.data
        if (!data) {
          return abandonAttempt("callFailed")
        }

        if (data.outcome !== "dialing") {
          // No call was created — the peer is unused.
          return abandonAttempt(data.outcome)
        }

        // Meta dialed a real call but the agent cancelled — hang it up so the
        // customer is not left ringing.
        if (isCancelled()) {
          finishCancelled()
          hangupWhatsappVoipCallAction(workspaceId, {
            whatsappCallId: data.whatsappCallId,
          }).catch((error: unknown) => {
            logger.error(
              { err: error, whatsappCallId: data.whatsappCallId },
              "WhatsApp outbound VoIP compensating hangup failed after cancel raced a late dialing outcome",
            )
          })
          return "cancelled"
        }

        // `browserRecordingEnabled` gates only the browser recorder; the
        // indicator follows `recordingRequested`.
        shouldRecordRef.current = data.browserRecordingEnabled
        upgradeToDialing(nonce, {
          whatsappCallId: data.whatsappCallId,
          wacid: data.wacid,
          attemptId: data.attemptId,
          conversationId: params.conversationId,
          contactInboxId: params.contactInboxId ?? "",
          contactName: params.contactName,
          deadlineAt: data.deadlineAt,
          browserRecordingEnabled: data.browserRecordingEnabled,
          recordingRequested: data.recordingRequested,
        })

        // Defensive: if another caller cleared the slot between upgrade and
        // here, hang up rather than leave a live call with no UI.
        if (
          useWhatsappVoipCallStore.getState().call?.whatsappCallId !==
          data.whatsappCallId
        ) {
          hangupWhatsappVoipCallAction(workspaceId, {
            whatsappCallId: data.whatsappCallId,
          }).catch((error: unknown) => {
            logger.error(
              { err: error, whatsappCallId: data.whatsappCallId },
              "WhatsApp outbound VoIP compensating hangup failed after the store's call slot was taken mid-dial",
            )
          })
          teardownIfStillOurs()
          return "occupied"
        }

        return "dialing"
      } catch (error) {
        // A `DOMException` serializes as `[object DOMException]`; log its name
        // and message so the failing step is visible.
        const named =
          error instanceof DOMException || error instanceof Error ? error : null
        logger.error(
          {
            err: error,
            errorName: named?.name,
            errorMessage: named?.message ?? String(error),
          },
          "WhatsApp outbound VoIP dial failed",
        )
        return abandonAttempt("callFailed")
      }
    },
    [
      workspaceId,
      teardown,
      startPreparing,
      setPreparingStage,
      upgradeToDialing,
      releasePreparing,
      createCallPeerConnection,
    ],
  )

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!(call && stream)) {
      return
    }
    const nextMuted = !call.isMuted
    for (const track of stream.getAudioTracks()) {
      track.enabled = !nextMuted
    }
    setMutedInStore(nextMuted)
  }, [call, setMutedInStore])

  // Armed only while `active`, so a ring or an in-flight answer is never
  // affected.
  useEffect(() => {
    if (!(call && workspaceId) || call.phase !== WhatsappVoipCallPhase.active) {
      return
    }
    const { whatsappCallId } = call
    const onPageHide = () => {
      try {
        const payload = JSON.stringify({ workspaceId, whatsappCallId })
        const blob = new Blob([payload], { type: "application/json" })
        navigator.sendBeacon(VOIP_CALL_HANGUP_BEACON_URL, blob)
      } catch (error) {
        logger.error(
          { err: error, whatsappCallId },
          "WhatsApp VoIP unload hangup beacon failed",
        )
      }
    }
    window.addEventListener("pagehide", onPageHide)
    return () => window.removeEventListener("pagehide", onPageHide)
  }, [call, workspaceId])

  // Warn before leaving the page drops a call the agent is engaged in. Not for
  // a merely ringing basket: under ring-all that would block every agent, and a
  // reload loses nothing since the resume fetch re-finds the offer.
  useEffect(() => {
    const shouldConfirmLeave =
      call !== null && LEAVE_CONFIRMATION_PHASES.has(call.phase)
    if (!shouldConfirmLeave) {
      return
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [call])

  // Heartbeat while `active` so the server can sweep a call whose `terminate`
  // webhook was lost. `ok: false` only stops the heartbeat — never the local
  // call, whose media may still be fine.
  useEffect(() => {
    if (
      !(call && workspaceId) ||
      call.phase !== WhatsappVoipCallPhase.active ||
      !call.wacid
    ) {
      return
    }
    const { wacid } = call
    let intervalId: ReturnType<typeof setInterval> | undefined
    const beat = () => {
      heartbeatActiveVoipCallAction(workspaceId, { wacid })
        .then((result) => {
          if (result?.data?.ok === false && intervalId !== undefined) {
            clearInterval(intervalId)
          }
        })
        .catch((error: unknown) => {
          logger.error(
            { err: error, wacid },
            "WhatsApp VoIP active-call heartbeat failed",
          )
        })
    }
    beat()
    intervalId = setInterval(beat, ACTIVE_CALL_HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [call, workspaceId])

  return {
    remoteAudioRef,
    answer,
    dismiss,
    hangup,
    toggleMute,
    dismissEnded,
    startOutbound,
  }
}
