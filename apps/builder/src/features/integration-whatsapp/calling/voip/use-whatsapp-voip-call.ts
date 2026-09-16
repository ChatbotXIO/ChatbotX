"use client"

import type { RefObject } from "react"
import { useCallback, useEffect, useRef } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { useWorkspaceId } from "@/hooks/routing"
import { logger } from "@/lib/log"
import { answerWhatsappVoipCallAction } from "../actions/answer-voip-call.action"
import { getPendingIncomingVoipCallAction } from "../actions/get-pending-incoming-voip-call.action"
import { hangupWhatsappVoipCallAction } from "../actions/hangup-voip-call.action"
import { heartbeatActiveVoipCallAction } from "../actions/heartbeat-active-voip-call.action"
import type { InitiateOutboundVoipCallResult } from "../actions/initiate-outbound-voip-call.action"
import { initiateOutboundVoipCallAction } from "../actions/initiate-outbound-voip-call.action"
import { outboundVoipTurnCredentialsAction } from "../actions/outbound-voip-turn-credentials.action"
import { getWhatsappVoipTurnCredentialsAction } from "../actions/voip-turn-credentials.action"
import { type CallRecorder, startCallRecorder } from "./call-recorder"
import {
  useWhatsappVoipCallStore,
  WhatsappVoipCallDirection,
  WhatsappVoipCallPhase,
} from "./voip-call-store"
import {
  captureMicrophoneStream,
  createOutboundOffer,
  registerConnectionHealthHandlers,
  VOIP_AUDIO_CONSTRAINTS,
  waitForIceGatheringComplete,
} from "./voip-peer-connection"

/**
 * Client-only cap on how long an outbound dial may sit in `preparing`
 * (TURN fetch + `getUserMedia` + offer/ICE-gather + the initiate
 * round-trip) before it is treated as failed — bounds a hung TURN fetch or
 * a mic prompt the agent never answers.
 */
const PREPARING_TIMEOUT_MS = 30_000

/**
 * How long the lingering `ended` phase stays visible in the call panel
 * before the store slot auto-clears — see `WhatsappVoipCallPhase.ended`.
 */
const ENDED_LINGER_MS = 2000

/**
 * Best-effort beacon on tab close/reload while a VoIP call is `active`, so
 * Meta's leg does not sit in dead air after the agent reloads mid-call.
 * `pagehide` (not `beforeunload`) fires reliably on both a real unload and a
 * back-forward-cache navigation, and — unlike a server action, which needs a
 * special multipart encoding `sendBeacon` cannot produce — this is a tiny
 * dedicated route so a single fire-and-forget POST is enough. Never awaited,
 * never blocks unload, and unreliable by nature (the browser may drop it);
 * the server-side deadline/expiry paths remain the authoritative backstop.
 */
const VOIP_CALL_HANGUP_BEACON_URL = "/api/whatsapp-voip-call-hangup"

/**
 * How often the browser pings the server while a call is `active` (accepted
 * and media flowing, wacid known) so a lost `terminate` webhook can still be
 * swept — see `docs/whatsapp-calling-gap-analysis-plan.md` and
 * `heartbeat-active-voip-call.action.ts`. Mirrors the presence heartbeat
 * cadence (`useWhatsappVoipPresence`'s `HEARTBEAT_INTERVAL_MS`).
 */
const ACTIVE_CALL_HEARTBEAT_INTERVAL_MS = 20_000

/**
 * Mic constraints tuned to stop the classic WebRTC "howl" (the mic picking the
 * remote party's voice back up off the speakers and feeding it into a loop):
 * the browser's echo canceller subtracts the played-back audio from the mic
 * signal, noise suppression cuts steady hiss, and auto gain keeps a level
 * output. A bare `audio: true` usually turns these on, but requesting them
 * explicitly makes the behaviour deterministic across devices and browsers.
 */
/**
 * Outcome an outbound dial attempt resolves to — every
 * {@link InitiateOutboundVoipCallResult} outcome, plus `"occupied"` for the
 * purely-local case where the single call slot is already busy (never
 * reaches the server). The button/UI layer branches on this to decide
 * whether to open the request-permission dialog, toast a mapped
 * `whatsapp.calls.outbound.<outcome>` message, or do nothing.
 */
export type StartOutboundOutcome =
  | InitiateOutboundVoipCallResult["outcome"]
  | "occupied"
  /** The agent hit End/cancel while the dial was still `preparing` — silent,
   * like `"occupied"` (the panel already closed itself). */
  | "cancelled"
  /** `getUserMedia` rejected with `NotAllowedError` — the browser/OS denied
   * microphone access. */
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
  /** Accepts the current incoming call: gathers a TURN/STUN answer, then calls the answer action. */
  answer: () => Promise<void>
  /** Silences this agent's incoming ring locally (ring-all — does not end the call for others). */
  dismiss: () => void
  /** Ends the current active (already-accepted) call, cancels an outbound
   * call still `preparing`/dialing/ringing (a local-only cancel token while
   * `preparing` — see `startOutbound`), or dismisses a lingering `ended`
   * call. */
  hangup: () => Promise<void>
  /** Toggles the local microphone track's `enabled` flag. */
  toggleMute: () => void
  /** Clears a lingering `ended` call immediately instead of waiting out the
   * ~2s auto-dismiss. */
  dismissEnded: () => void
  /**
   * Places a business-initiated (outbound) VoIP call: builds the SDP OFFER
   * locally (`getUserMedia` + `createOffer`), then calls
   * `initiateOutboundVoipCallAction`. No-op (`"occupied"`) while the single
   * call slot already holds another call.
   */
  startOutbound: (params: StartOutboundParams) => Promise<StartOutboundOutcome>
}

/**
 * Native-`RTCPeerConnection` browser WebRTC peer for WhatsApp calls, with no
 * signaling library in between. Driven entirely by
 * `useWhatsappVoipCallStore`: an incoming offer arrives via the realtime
 * consumer (`ChatRealtime`) calling `addIncoming`, and this hook answers,
 * rejects, or hangs it up, tearing the peer connection + local mic track
 * down on every exit path (answered-elsewhere, rejected, hung up, remote
 * end, or unmount) so neither ever leaks.
 */
export function useWhatsappVoipCall(): UseWhatsappVoipCallResult {
  const workspaceId = useWorkspaceId()
  const call = useWhatsappVoipCallStore((state) => state.call)
  const setPhase = useWhatsappVoipCallStore((state) => state.setPhase)
  const markActive = useWhatsappVoipCallStore((state) => state.markActive)
  const setMutedInStore = useWhatsappVoipCallStore((state) => state.setMuted)
  const setRecordingInStore = useWhatsappVoipCallStore(
    (state) => state.setRecording,
  )
  const handleEnded = useWhatsappVoipCallStore((state) => state.handleEnded)
  const reset = useWhatsappVoipCallStore((state) => state.reset)
  const addIncoming = useWhatsappVoipCallStore((state) => state.addIncoming)
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
  const bubbleConversationToTop = useChatStore(
    (state) => state.bubbleConversationToTop,
  )

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  /** The track-less `sendrecv` audio transceiver created up front on
   * every peer — the mic track is only ever attached to it via
   * `sender.replaceTrack` once the call is actually accepted (inbound: the
   * accept action resolves; outbound: the ACCEPTED status event), so no RTP
   * ever flows before that point. */
  const audioTransceiverRef = useRef<RTCRtpTransceiver | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const resumeFetchedRef = useRef(false)
  const recorderRef = useRef<CallRecorder | null>(null)
  /** Set once `answer`/`startOutbound` learns `browserRecordingEnabled`
   * — gates whether the BROWSER MediaRecorder should ever start for this
   * call. Never true under the default `metaNative` mode (Meta records
   * server-side there). Read by the `ontrack` handler if the
   * remote track arrives after the accept/answer round-trip. */
  const shouldRecordRef = useRef(false)
  /** Cancel token for `startOutbound`'s `preparing` phase — set by
   * `hangup` to the cancelled attempt's nonce; `startOutbound` checks it
   * after every await and, if the dial still resolves to a real server call
   * after cancellation, fires a compensating hangup rather than leaving Meta
   * mid-dial with no local UI. */
  const cancelledAttemptIdRef = useRef<string | null>(null)

  // Resume-after-refresh: a ring is otherwise delivered exactly once over
  // realtime, so an agent who hits F5 while a call is still ringing loses the
  // incoming UI even though the server-side offer/control TTL (~55s) may
  // still make it answerable. Runs at most once per mount (guarded by the
  // ref, not by `call`/`workspaceId` in the dep list, so a later socket
  // reconnect or an in-progress answer never re-triggers it) — never
  // re-fetches on every render. `addIncoming` itself already no-ops if a
  // call is already in progress by the time the response lands, and the
  // client deadline timer above dismisses it if it has since expired.
  useEffect(() => {
    if (resumeFetchedRef.current || !workspaceId) {
      return
    }
    resumeFetchedRef.current = true
    if (useWhatsappVoipCallStore.getState().call) {
      return
    }

    getPendingIncomingVoipCallAction(workspaceId)
      .then((result) => {
        const pending = result?.data
        if (pending) {
          addIncoming(pending)
          // Mirror the realtime incoming handler (`ChatRealtime`): surface
          // the ringing conversation at the top of the inbox list here too,
          // or a ring resumed after a reload never bubbles. Errors are
          // already logged inside `bubbleConversationToTop` itself.
          bubbleConversationToTop(workspaceId, pending.conversationId).catch(
            () => undefined,
          )
        }
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error },
          "WhatsApp VoIP resume-after-refresh lookup failed",
        )
      })
  }, [workspaceId, addIncoming, bubbleConversationToTop])

  const teardown = useCallback(() => {
    // Stop the recorder BEFORE closing the peer/mic tracks: `stop` only
    // requests a final `dataavailable` flush and returns synchronously — the
    // assembled blob's upload runs asynchronously in `onstop`, after this
    // function returns, so it is unaffected by the mic track stopping right
    // after. Ordering here is what guarantees the last audio chunk is never
    // lost on any teardown path (hangup, remote-ended, reject, unmount).
    recorderRef.current?.stop()
    recorderRef.current = null
    shouldRecordRef.current = false
    remoteStreamRef.current = null
    setRecordingInStore(false)

    peerConnectionRef.current?.close()
    peerConnectionRef.current = null
    audioTransceiverRef.current = null
    for (const track of localStreamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    localStreamRef.current = null
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
  }, [setRecordingInStore])

  /** Shared unrecoverable-connection handler wired onto every peer via
   * {@link registerConnectionHealthHandlers} — never a bare local teardown:
   * an already-accepted call still needs a server-side `terminate` (compensating
   * hangup) so Meta's leg does not linger, while a call still `preparing`
   * (no server call exists yet) just releases the local slot. Shows the
   * translated "connection lost" notice via the lingering `ended` phase.
   *
   * Also the shared failure path for a post-accept `replaceTrack` rejection
   * or a missing mic track (see the inbound-accept and outbound-ACCEPTED
   * mic-attach sites) — either one is treated exactly like an ICE/connection
   * failure so the UI and compensating hangup behave identically.
   *
   * Idempotent: an ICE failure and a `replaceTrack` failure can both fire
   * for the same call (e.g. connectionstatechange races the mic-attach
   * failure), so once the call is already `ended` this is a no-op beyond
   * the always-safe `teardown()` — it must never call `handleEnded`/hangup
   * twice for the same call. */
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

  /** Starts the BROWSER recorder once the local mic track, the remote
   * party's track, and `browserRecordingEnabled` (never true under
   * `metaNative`) are all available — whichever of `ontrack` and the
   * `"accepted"`/`"active"` outcome resolves last calls this. This never
   * drives the panel's "recording requested" indicator — that reflects
   * `recordingRequested` and is set directly from the initiate/answer
   * result regardless of whether a browser recorder actually starts, since
   * Meta may be recording server-side even when the browser never captures
   * anything locally. */
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

  // The store's call is cleared either by this hook (reset after
  // reject/hangup/failure) or externally (the transport-ended realtime
  // event, via `handleEnded`, on remote hangup or deadline expiry). Only the
  // external path needs this effect — the internal paths already tear down
  // before calling reset — but running it unconditionally is a safe no-op
  // when the peer is already closed, and guarantees a leaked peer can never
  // survive the store saying the call is over. `ended` is included even
  // though the call object LINGERS in the store (for the panel's ~2s
  // message) — the peer/mic themselves must still be released immediately.
  useEffect(() => {
    if (!call || call.phase === WhatsappVoipCallPhase.ended) {
      teardown()
    }
  }, [call, teardown])

  // Auto-clears a lingering `ended` call ~2s after it lands, unless the
  // agent dismisses it sooner (`dismissEnded`) or a new call replaces it
  // first (in which case the dep-array change clears this stale timeout).
  // Since `ended` is now treated as a FREE slot — a new incoming ring
  // or outbound dial can overwrite it well within the 2s linger — this
  // timeout must only reset if the slot STILL holds the SAME
  // `whatsappCallId` by the time it fires; otherwise it would clobber the
  // call that has since taken the slot.
  useEffect(() => {
    if (call?.phase !== WhatsappVoipCallPhase.ended) {
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

  // Consumes the decoupled outbound-answer handoff (`chat-realtime.tsx` sets
  // it from the `whatsappCallOutboundAnswer` realtime event): applies the
  // SDP answer to the live peer once it matches the current outbound call.
  //
  // Meta's Call-Connect (answer) webhook is sent right after initiation —
  // BEFORE pickup — so it can race the tail of `initiateOutboundVoipCallAction`
  // and land while the store's call slot is still empty (before `addOutbound`
  // runs). Discarding it there would leave the pc with no remote description
  // forever, since the worker has already deleted its Redis copy. So:
  //   - no call yet -> BUFFER (do nothing); `call` is a dep, so this effect
  //     re-runs and applies the answer once `upgradeToDialing` creates the
  //     matching call moments later.
  //   - our own call is still `preparing` (no real `whatsappCallId` minted
  //     client-side yet, even though the server call — and this answer for
  //     it — already exist) -> BUFFER; `upgradeToDialing` will replace the
  //     nonce with the real id and this effect re-runs and matches then.
  //   - matches the current call but no live peer (e.g. the agent reloaded
  //     mid-dial) -> drop, it can never be applied.
  //   - matches the current call and a live peer exists -> apply, then clear.
  //   - a DIFFERENT, already-resolved call now occupies the slot -> drop;
  //     this answer's call is gone and can never come back, so keeping it
  //     would leak indefinitely.
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
      // A different, already-resolved call occupies the single-call slot
      // now — this answer's call is gone for good; drop it rather than
      // buffer forever.
      clearPendingOutboundAnswer()
    }
    // else: no call in the store yet, or our own call is still `preparing`
    // — keep buffering.
  }, [pendingOutboundAnswer, call, clearPendingOutboundAnswer])

  // Drives the recorder from the `"active"` phase transition itself (fed by
  // the `whatsappCallOutboundStatus` realtime event via `setOutboundStatus`)
  // — NOT `pc.connectionState`. `maybeStartRecorder` is also
  // called from `ontrack` below; whichever of the two resolves last actually
  // starts it, since both are idempotent no-ops once a recorder exists.
  //
  // This is also the outbound mic-attach point — Meta's ACCEPTED status
  // event drives `setOutboundStatus(..., "accepted")`, which is what moves
  // the store to `active` here. `replaceTrack` is a no-op renegotiation-free
  // call, safe to invoke again if this effect re-runs for the same call
  // (e.g. a mute toggle) — guarded on the sender not already holding the
  // track.
  useEffect(() => {
    if (
      call?.direction === WhatsappVoipCallDirection.outbound &&
      call.phase === WhatsappVoipCallPhase.active
    ) {
      const transceiver = audioTransceiverRef.current
      const micTrack = localStreamRef.current?.getAudioTracks()[0]
      if (transceiver && transceiver.sender.track !== micTrack) {
        if (micTrack) {
          transceiver.sender.replaceTrack(micTrack).catch((error: unknown) => {
            logger.error(
              { err: error, whatsappCallId: call.whatsappCallId },
              "WhatsApp outbound VoIP replaceTrack after ACCEPTED failed",
            )
            // No outbound audio can ever flow without this track — treat it
            // exactly like an unrecoverable connection failure rather than
            // leaving the UI/heartbeat running silently.
            handleConnectionLost()
          })
        } else {
          logger.error(
            { whatsappCallId: call.whatsappCallId },
            "WhatsApp outbound VoIP replaceTrack after ACCEPTED skipped — no local mic track",
          )
          handleConnectionLost()
        }
      }
      maybeStartRecorder(call.whatsappCallId)
    }
  }, [call, maybeStartRecorder, handleConnectionLost])

  const answer = useCallback(async () => {
    if (
      !(call && workspaceId) ||
      call.phase !== WhatsappVoipCallPhase.incomingRinging ||
      // Every inbound call carries an offer (`addIncoming` requires one) —
      // `offer` is only optional on the shared `WhatsappVoipCall` type
      // because an outbound call never has one. This can never actually be
      // reached for a call still in `incomingRinging`.
      !call.offer
    ) {
      return
    }
    const { whatsappCallId, offer } = call
    setPhase(whatsappCallId, WhatsappVoipCallPhase.answering)

    try {
      const turnResult = await getWhatsappVoipTurnCredentialsAction(
        workspaceId,
        { whatsappCallId },
      )
      const credentials = turnResult?.data
      if (!credentials) {
        throw new Error("voip-turn-credentials-unavailable")
      }
      if (!credentials.turnConfigured) {
        logger.warn(
          { whatsappCallId },
          "WhatsApp VoIP call answered without a configured TURN server — STUN-only is not sufficient behind hostile NATs in production",
        )
      }

      const pc = new RTCPeerConnection({ iceServers: credentials.iceServers })
      peerConnectionRef.current = pc
      registerConnectionHealthHandlers(pc, handleConnectionLost)
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams
        if (remoteAudioRef.current && remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream
        }
        if (remoteStream) {
          remoteStreamRef.current = remoteStream
          maybeStartRecorder(whatsappCallId)
        }
      }

      // A track-less `sendrecv` transceiver up front — the SDP still
      // offers to send/receive audio (so Meta's callee never sees a
      // downgraded `recvonly` offer), but no RTP flows until the mic track
      // is attached via `replaceTrack` below, AFTER accept succeeds.
      const transceiver = pc.addTransceiver("audio", { direction: "sendrecv" })
      audioTransceiverRef.current = transceiver

      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp })

      // Acquire the mic now (so a denial/missing-device surfaces before the
      // agent waits out the whole accept round-trip) but do NOT attach it to
      // the transceiver yet — see the `replaceTrack` call below.
      const localStream = await navigator.mediaDevices.getUserMedia(
        VOIP_AUDIO_CONSTRAINTS,
      )
      localStreamRef.current = localStream

      const answerDescription = await pc.createAnswer()
      await pc.setLocalDescription(answerDescription)
      await waitForIceGatheringComplete(pc)

      // This exact string is the ONLY answer SDP ever generated for this
      // call — `answerWhatsappVoipCallAction` submits it unmodified to both
      // Meta's `pre_accept` and `accept` (see `answer-voip-call.action.ts`),
      // so the two are byte-identical by construction (never regenerated).
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
        // The store's call may have been cleared (dismissed, or overwritten
        // by a fresh incoming offer) while this `await` was in flight. Meta
        // and our DB row now say "accepted" with no local UI left to hang
        // it up — send a compensating hangup rather than silently leaving
        // an orphaned accepted call.
        if (
          useWhatsappVoipCallStore.getState().call?.whatsappCallId !==
          whatsappCallId
        ) {
          hangupWhatsappVoipCallAction(workspaceId, { whatsappCallId }).catch(
            (error: unknown) => {
              logger.error(
                { err: error, whatsappCallId },
                "WhatsApp VoIP compensating hangup failed after the store's call was cleared mid-answer",
              )
            },
          )
          teardown()
          return
        }

        markActive(whatsappCallId)
        // Only NOW — accept has actually resolved — attach the mic
        // track, via `replaceTrack` (no renegotiation, no new SDP). Before
        // this point `transceiver.sender.track` is `null`, so no RTP is ever
        // sent while the call is still ringing/answering.
        const micTrack = localStream.getAudioTracks()[0]
        if (micTrack) {
          transceiver.sender.replaceTrack(micTrack).catch((error: unknown) => {
            logger.error(
              { err: error, whatsappCallId },
              "WhatsApp VoIP replaceTrack after accept failed",
            )
            // No outbound audio can ever flow without this track — treat it
            // exactly like an unrecoverable connection failure rather than
            // leaving the UI/heartbeat running silently.
            handleConnectionLost()
          })
        } else {
          logger.error(
            { whatsappCallId },
            "WhatsApp VoIP replaceTrack after accept skipped — no local mic track",
          )
          handleConnectionLost()
        }
        // Only the answering agent ever reaches this branch, so a losing
        // ring-all agent never starts a recorder — no extra gating needed.
        // `browserRecordingEnabled` gates the BROWSER MediaRecorder only —
        // never true under `metaNative` mode. `isRecording` is set
        // directly from `recordingRequested` so the panel's "recording
        // requested" indicator reflects Meta's server-side recording too,
        // not just whether the browser itself captured anything.
        shouldRecordRef.current = data.browserRecordingEnabled
        setRecordingInStore(data.recordingRequested)
        maybeStartRecorder(whatsappCallId)
        return
      }

      // "cannotAnswer" / "callEnded" (or a thrown/validation error, folded
      // into the same branch below) — media never flowed; drop the UI.
      teardown()
      reset()
    } catch (error) {
      logger.error(
        { err: error, whatsappCallId },
        "WhatsApp VoIP answer flow failed",
      )
      teardown()
      reset()
    }
  }, [
    call,
    workspaceId,
    setPhase,
    markActive,
    reset,
    teardown,
    maybeStartRecorder,
    setRecordingInStore,
    handleConnectionLost,
  ])

  // Ring-all: dismissing an incoming call is LOCAL only — the same offer is
  // rung to every available agent (ring-all), so declining just silences it
  // call for the others still ringing. The call ends for everyone only when
  // someone answers, the caller hangs up, or the deadline lapses (the worker
  // then Meta-rejects it as missed). No server action here.
  const dismiss = useCallback(() => {
    teardown()
    reset()
  }, [teardown, reset])

  // Extended (beyond the inbound `active`-only gate) so an outbound call can
  // also be cancelled while still `outboundDialing`/`outboundRinging` — Meta
  // has no local "cancel before pickup" concept, so this reuses the same
  // `hangupWhatsappVoipCallAction`, which finalizes via the shared
  // `voip:ctrl:<wacid>` control regardless of which phase it was ended from
  //.
  const hangup = useCallback(async () => {
    if (!(call && workspaceId)) {
      return
    }

    // Cancel a dial still `preparing` — no server-side call exists yet, so
    // there is nothing to hang up against. Mark the attempt cancelled so
    // `startOutbound`'s still-in-flight async work fires a compensating
    // hangup itself if Meta ends up dialing anyway.
    if (call.phase === WhatsappVoipCallPhase.preparing) {
      cancelledAttemptIdRef.current = call.whatsappCallId
      teardown()
      releasePreparing(call.whatsappCallId)
      return
    }

    // An outbound call that has been dialed but never answered — cancelling
    // it here (whether the agent clicks End or the deadline backstop effect
    // below fires this same function) must show a terminal "No answer"
    // message rather than vanishing silently, so it routes through
    // `handleEnded` (which
    // lingers ~2s) instead of a bare `reset`. An `active` call (answered,
    // media flowed) keeps the original immediate-reset behavior.
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
  }, [call, workspaceId, teardown, reset, releasePreparing, handleEnded])

  /** Clears a lingering `ended` call immediately. */
  const dismissEnded = useCallback(() => {
    reset()
  }, [reset])

  // Client-side deadline backstop: if an incoming call is never answered by
  // its deadline, dismiss the ringing UI (and tear the peer down) even if the
  // server's transport-ended event never arrives — e.g. a dropped socket. Only
  // armed while the call is still `incomingRinging`: once the agent starts
  // answering, the `answer` flow owns the peer's lifecycle (it tears down on
  // failure), so a slow mic prompt / TURN / Graph round-trip near the deadline
  // must NOT let this timer close the peer out from under an in-flight — and
  // possibly succeeding — accept. Mirrored for the outbound
  // `outboundDialing`/`outboundRinging` phases so a dial that is never
  // accepted also clears its local UI — but for outbound, the deadline routes
  // through `hangup` (server-side end) rather than a bare local teardown:
  // Meta notes its `ACCEPTED` status event is "primarily for
  // auditing" and can arrive late or be lost, in which case the call is
  // actually established (DB/Redis/Meta all say accepted) even though this
  // client's phase never advanced past dialing/ringing — a bare local
  // teardown there would kill only the local peer and leave the customer in
  // dead air with no server-side hangup. `hangup` itself only acts while
  // the call is still in a hangupable phase, so it is a safe no-op if the
  // phase already advanced to `active` by the time the timer fires (in which
  // case this effect's own re-run — `call` is a dep — would have already
  // cleared the stale timeout anyway). The server enforces its own
  // authoritative expiry independently either way.
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

  // Bounds how long a dial may sit `preparing` (TURN fetch + mic prompt +
  // offer/ICE-gather + the initiate round-trip) — a hung TURN fetch or a mic
  // prompt the agent never answers must not leave the panel open forever.
  // Routes through `hangup` so a dial that resolves to a real server call
  // AFTER this fires still gets a compensating hangup.
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

  // Places a business-initiated (outbound) VoIP call: the browser generates
  // the SDP OFFER (inverted from the inbound `answer` flow, which receives
  // one).: no video track is ever
  // requested or offered.
  const startOutbound = useCallback(
    async (params: StartOutboundParams): Promise<StartOutboundOutcome> => {
      if (!workspaceId || useWhatsappVoipCallStore.getState().call) {
        return "occupied"
      }

      // Claimed INSTANTLY, before any TURN/getUserMedia/offer/ICE/initiate
      // work — the call panel renders the moment the agent clicks. Keyed by this local nonce; `upgradeToDialing` replaces it
      // with the real server id once `initiateOutboundVoipCallAction`
      // returns `"dialing"`.
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
       * Unwinds this attempt after the agent cancelled it: clears the cancel
       * token and releases the preparing slot (a no-op once
       * `upgradeToDialing` already moved past it), tearing the peer/mic down
       * with it.
       *
       * `tearDownPeer: false` is required before this attempt has created a
       * peer: the refs are shared across attempts, so a stale cancelled
       * attempt must never close a newer attempt's peer/mic.
       */
      const finishCancelled = ({ tearDownPeer } = { tearDownPeer: true }) => {
        if (tearDownPeer) {
          teardown()
        }
        clearCancelToken()
        releasePreparing(nonce)
        return "cancelled" as const
      }
      const releaseIfStillPreparing = () => {
        releasePreparing(nonce)
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
          // No peer exists for this attempt yet — tearing down here would hit
          // a newer attempt's peer/mic through the shared refs.
          return finishCancelled({ tearDownPeer: false })
        }

        const pc = new RTCPeerConnection({ iceServers: credentials.iceServers })
        peerConnectionRef.current = pc
        registerConnectionHealthHandlers(pc, handleConnectionLost)
        pc.ontrack = (event) => {
          const [remoteStream] = event.streams
          if (remoteAudioRef.current && remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream
          }
          if (remoteStream) {
            remoteStreamRef.current = remoteStream
            const activeCall = useWhatsappVoipCallStore.getState().call
            if (
              activeCall &&
              activeCall.phase !== WhatsappVoipCallPhase.preparing
            ) {
              maybeStartRecorder(activeCall.whatsappCallId)
            }
          }
        }

        // A track-less `sendrecv` transceiver, exactly like the inbound
        // `answer` flow — the OFFER already asks to send/receive audio, but
        // no RTP flows until the mic track is attached below, once the
        // outbound call's status reaches ACCEPTED (never here, while still
        // ringing).
        const transceiver = pc.addTransceiver("audio", {
          direction: "sendrecv",
        })
        audioTransceiverRef.current = transceiver

        setPreparingStage(nonce, "mic")
        const microphone = await captureMicrophoneStream()
        if ("failure" in microphone) {
          teardown()
          if (isCancelled()) {
            clearCancelToken()
            return "cancelled"
          }
          releaseIfStillPreparing()
          if (microphone.error !== undefined) {
            logger.error(
              { err: microphone.error },
              "WhatsApp outbound VoIP getUserMedia failed",
            )
          }
          return microphone.failure
        }
        // Mic acquired but NOT attached to the transceiver yet — see
        // the `replaceTrack` call once the outbound call reaches ACCEPTED.
        localStreamRef.current = microphone.stream

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
          teardown()
          if (isCancelled()) {
            clearCancelToken()
            return "cancelled"
          }
          releaseIfStillPreparing()
          return "callFailed"
        }

        if (data.outcome !== "dialing") {
          // No live call was created on any of these branches (needs
          // permission, glare, ineligible, rate-limited, etc.) — the peer
          // built above is now unused.
          teardown()
          if (isCancelled()) {
            clearCancelToken()
            return "cancelled"
          }
          releaseIfStillPreparing()
          return data.outcome
        }

        // Meta has now dialed a real server-side call. If the agent cancelled
        // while this was in flight, there is no local UI left to answer it —
        // fire a compensating hangup rather than leave the customer's leg
        // ringing in the void, and tear down this attempt's now-orphaned
        // peer/mic.
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

        // `browserRecordingEnabled` gates the BROWSER MediaRecorder only —
        // never true under `metaNative` mode. `upgradeToDialing` sets
        // the store's `isRecording` directly from `recordingRequested`, so
        // the panel's "recording requested" indicator reflects Meta's
        // server-side recording too, not just the browser's own capture.
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

        // Defence in depth: `upgradeToDialing` only succeeds if the slot
        // still holds THIS preparing attempt, so this should always match —
        // but re-check post-upgrade and, if some other caller nulled the
        // slot in between, fire a best-effort compensating hangup rather
        // than leaving a live call with no client representation.
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
          teardown()
          return "occupied"
        }

        return "dialing"
      } catch (error) {
        // A WebRTC failure surfaces as a `DOMException`, which the structured
        // logger's `err` serializer stringifies to a useless
        // `[object DOMException]`. Pull its `name`/`message` out explicitly so
        // the log names the actual failing step (e.g. an ICE/`setLocalDescription`
        // failure when no TURN relay is reachable).
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
        teardown()
        if (isCancelled()) {
          clearCancelToken()
          return "cancelled"
        }
        releaseIfStillPreparing()
        return "callFailed"
      }
    },
    [
      workspaceId,
      teardown,
      startPreparing,
      setPreparingStage,
      upgradeToDialing,
      releasePreparing,
      maybeStartRecorder,
      handleConnectionLost,
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

  // Best-effort cleanup on tab close/reload — see
  // `VOIP_CALL_HANGUP_BEACON_URL`. Armed only while the call is `active`, so
  // an incoming ring or an in-flight `answer` is never affected by it.
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

  // Client-driven liveness — while a call is `active` (accepted,
  // media flowing, wacid known — inbound or outbound), ping the server every
  // `ACTIVE_CALL_HEARTBEAT_INTERVAL_MS` so a lost `terminate` webhook can
  // still be swept server-side (see `heartbeat-active-voip-call.action.ts`).
  // Stops on end/teardown (the effect cleanup) or the moment the server
  // reports `ok: false` — that only means the server itself has stopped
  // recognizing this heartbeat as authoritative (e.g. superseded elsewhere);
  // it must NEVER tear the local call down, since the local WebRTC media may
  // still be flowing fine.
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
