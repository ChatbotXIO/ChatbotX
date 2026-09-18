"use client"

import { useTranslations } from "next-intl"
import type { RefObject } from "react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"
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
  isCallSlotFree,
  useWhatsappVoipCallStore,
  type WhatsappVoipCall,
  WhatsappVoipCallDirection,
  WhatsappVoipCallPhase,
} from "./voip-call-store"
import {
  attachMicrophone,
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
 * `heartbeat-active-voip-call.action.ts`. Mirrors the workspace presence
 * report cadence (`PRESENCE_REPORT_INTERVAL_MS`,
 * `apps/realtime/src/parties/workspaces.ts`).
 */
const ACTIVE_CALL_HEARTBEAT_INTERVAL_MS = 20_000

/**
 * Local expiry for a ringing offer whose `deadlineAt` cannot be parsed.
 * Comfortably past Meta's own offer/control TTL (~55s), so it never cuts a
 * still-answerable offer short, while making sure a malformed deadline can
 * never strand a dead ring in the basket forever if the transport-ended
 * event is also lost — the exact case this local backstop exists for.
 */
const RING_FALLBACK_EXPIRY_MS = 90_000

/**
 * Phases in which leaving the tab would drop a call the agent is actively
 * engaged with (answering an offer, dialing out, or already on the call) —
 * D7 in `docs/whatsapp-calling-parity-plan.md`. `incomingRinging`
 * is deliberately excluded: an unanswered offer still lives in the
 * `ringingCalls` basket (or, once promoted, is checked separately below),
 * so the ringing-basket check covers it without double-counting the
 * promoted slot's own `incomingRinging` phase.
 */
const LEAVE_CONFIRMATION_PHASES = new Set<WhatsappVoipCallPhase>([
  WhatsappVoipCallPhase.answering,
  WhatsappVoipCallPhase.outboundDialing,
  WhatsappVoipCallPhase.outboundRinging,
  WhatsappVoipCallPhase.active,
])

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
  /**
   * Accepts an incoming call: gathers a TURN/STUN answer, then calls the
   * answer action. With no `whatsappCallId`, targets whatever currently
   * occupies the single call slot (today's behavior, unchanged). With an
   * id, targets a specific offer — the slot's call (if it matches) or a
   * basket entry (see `ringingCalls` in `voip-call-store.ts`), which is
   * first end-the-current-call-then-promoted before being answered. See the
   * function body for the full race analysis (stale closures, double
   * clicks, replacement).
   */
  answer: (whatsappCallId?: string) => Promise<void>
  /**
   * Silences an incoming ring locally. With no id, the current slot's ring
   * (ring-all — does not end the call for others), exactly as before. With
   * an id, drops just that one basket entry — never calls `teardown()`,
   * since a basket entry owns no peer connection or mic to tear down.
   */
  dismiss: (whatsappCallId?: string) => void
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
 * consumer (`ChatRealtime`) calling `enqueueRinging`, landing in the basket
 * (`ringingCalls`) rather than the single `call` slot directly — a basket
 * entry owns no `RTCPeerConnection`, no mic, and no timer of its own (this
 * hook owns the per-entry expiry timers). `answer` promotes one basket
 * entry into the slot, and this hook then answers, rejects, or hangs it up,
 * tearing the peer connection + local mic track down on every exit path
 * (answered-elsewhere, rejected, hung up, remote end, or unmount) so
 * neither ever leaks.
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
  // `promoteRinging` itself is always invoked via `getState()` (see
  // `answer` below) rather than a selected reference — every decision in
  // that function reads fresh state deliberately, never a render-time
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
  /** Mutex serializing `answer()` attempts — see the function body. Holds
   * the `whatsappCallId` currently being answered (slot or basket), `null`
   * otherwise. */
  const answeringIdRef = useRef<string | null>(null)
  /** Flipped to `false` by the unmount effect below — read after the
   * resource-creating awaits in `answerIncoming` (the TURN fetch + mic
   * prompt, and the accept round-trip) so a provider unmount mid-request can
   * tear down whatever THIS attempt just built, rather than leaving an
   * orphaned peer connection and a LIVE MICROPHONE with no component left
   * to ever call `teardown()` again. The existing
   * `useEffect(() => teardown, [teardown])` safety net only tears down
   * whatever the refs held AT THE MOMENT OF UNMOUNT — it cannot catch
   * resources a still-in-flight continuation creates afterwards. */
  const isMountedRef = useRef(true)

  // Resume-after-refresh: a ring is otherwise delivered exactly once over
  // realtime, so an agent who hits F5 while calls are still ringing loses
  // the incoming UI for ALL of them even though the server-side
  // offer/control TTL (~55s) may still make them answerable. Runs at most
  // once per mount (guarded by the ref, not by `workspaceId` in the dep
  // list, so a later socket reconnect or an in-progress answer never
  // re-triggers it) — never re-fetches on every render.
  //
  // Deliberately does NOT early-exit when the slot already holds a call —
  // ring-all means several offers can be outstanding at once, and every one
  // of them belongs in the basket regardless of whether this agent is
  // already engaged with a different call. `enqueueRinging` itself already
  // no-ops for an id already in the basket or occupying the slot, and each
  // entry's own expiry timer (see below) dismisses it if it has since
  // expired.
  useEffect(() => {
    if (resumeFetchedRef.current || !workspaceId) {
      return
    }
    resumeFetchedRef.current = true

    getPendingIncomingVoipCallAction(workspaceId)
      .then((result) => {
        const pending = result?.data ?? []
        // `listResumableIncoming` orders newest-created-first (the
        // repository's `findRingingByWorkspace` is `desc(createdAt)`), but
        // a LIVE realtime ring lands oldest-first relative to whatever is
        // already ringing (each `whatsappCallTransportIncoming` event
        // simply appends via `enqueueRinging`) — reversing here keeps the
        // basket's arrival order consistent between the two paths instead
        // of depending on which one populated it first.
        for (const pendingCall of [...pending].reverse()) {
          // Bubbling the ringing conversation to the top of the inbox list
          // is now `ChatRealtime`'s job: it subscribes directly to this
          // store's `ringingCalls` basket (see `chat-realtime.tsx`), which
          // covers both a live realtime ring AND an entry enqueued here on
          // resume-after-refresh — this hook no longer needs `ChatStore` at
          // all (and stays mountable without a `ChatStoreProvider`, e.g. at
          // the workspace layout level).
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

  // Basket expiry: a `ringingCalls` entry owns no timer of its own (it is
  // pure data — see `WhatsappVoipRingingCall`), so this hook is the single
  // owner of "dismiss this offer once its deadline passes" for every entry
  // currently in the basket. No peer/mic teardown here — a basket entry
  // never had either.
  //
  // Keyed on a fingerprint of `id:deadlineAt` pairs, NOT on `ringingCalls`
  // itself: the array gets a new identity on every enqueue/remove, so a
  // naive `[ringingCalls]` dependency would tear down and re-arm every
  // SURVIVING entry's timer on every unrelated basket mutation (e.g. a
  // second ring arriving does not change the first ring's deadline, but it
  // does change the array). Deadlines are absolute (`setTimeout` computed
  // from `deadlineAt - Date.now()`), so even a spurious re-arm could never
  // extend a call past its real deadline — but relying on that instead of
  // fixing the dependency would still mean this effect keeps tearing down
  // and recreating timers proportional to unrelated basket churn.
  const ringingFingerprint = useMemo(
    () =>
      ringingCalls
        .map((entry) => `${entry.whatsappCallId}:${entry.deadlineAt}`)
        .join(","),
    [ringingCalls],
  )
  // `ringingFingerprint` (not `ringingCalls`) is the intentional re-arm
  // trigger — see the comment above.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ringingFingerprint substitutes for ringingCalls on purpose
  useEffect(() => {
    const timeoutIds = ringingCalls.flatMap((entry) => {
      const deadlineMs = new Date(entry.deadlineAt).getTime()
      // An unparseable deadline would make `Math.max(NaN, 0)` NaN, which
      // `setTimeout` coerces to 0 — the ring would vanish the instant it
      // arrived, before the agent could ever see it. Arming NO timer is not
      // the answer either: this backstop exists precisely for a lost
      // transport-ended event, so skipping it can strand a dead ring in the
      // basket until the agent reloads. Fall back to a bounded delay past
      // Meta's own TTL instead, which is wrong in neither direction.
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

  // Unmount safety net for the basket, mirroring the peer/mic teardown
  // effect below: the per-entry expiry timers above die with this effect
  // anyway (their own cleanup runs on unmount), but the basket ITSELF would
  // otherwise survive in the store — stale offers with dead timers that can
  // never self-expire. `WhatsappVoipCallProvider` mounts this hook exactly
  // once for the app's lifetime in practice, so this mostly matters for
  // tests and hot-reload.
  useEffect(() => clearRinging, [clearRinging])

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
   * Idempotent: `connectionState` can reach `failed` more than once for the
   * same call, so once it is already `ended` this is a no-op beyond the
   * always-safe `teardown()` — it must never call `handleEnded`/hangup twice
   * for the same call. */
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

  // Companion to the safety net above: flips `isMountedRef` so an
  // in-flight `answerIncoming` continuation can detect the unmount AFTER it
  // resumes from an await, not just at the instant of unmount — see FIX 2
  // in `answerIncoming`'s block comment.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

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
  // Recorder only — this must never touch the media path. The mic is attached
  // when the offer is built (see `attachMicrophone`), precisely so audio does
  // not depend on Meta's best-effort ACCEPTED event arriving.
  useEffect(() => {
    if (
      call?.direction === WhatsappVoipCallDirection.outbound &&
      call.phase === WhatsappVoipCallPhase.active
    ) {
      maybeStartRecorder(call.whatsappCallId)
    }
  }, [call, maybeStartRecorder])

  /**
   * The actual "gather a TURN/STUN answer, then call the answer action"
   * flow — extracted so it can run against a call object passed in as a
   * PARAMETER rather than read from this hook's `call` (the React state
   * selector's snapshot for the render `answer` was created in). This
   * matters because `answer` below may `promoteRinging` a basket entry into
   * the slot and needs to act on that freshly-promoted call in the SAME
   * tick — the `call` closure is still the pre-promote value (`null`, or a
   * different call) until React re-renders, so reusing it here would
   * silently answer nothing (or the wrong call).
   */
  const answerIncoming = useCallback(
    async (incomingCall: WhatsappVoipCall) => {
      if (
        !workspaceId ||
        incomingCall.phase !== WhatsappVoipCallPhase.incomingRinging ||
        // Every inbound call carries an offer (`promoteRinging` moves one
        // in) — `offer` is only optional on the shared
        // `WhatsappVoipCall` type because an outbound call never has one.
        // This can never actually be reached for a call still in
        // `incomingRinging`.
        !incomingCall.offer
      ) {
        return
      }
      const { whatsappCallId, offer } = incomingCall
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

        // Acquire the mic first, so a denial or missing device surfaces before
        // the agent waits out the whole accept round-trip.
        const localStream = await navigator.mediaDevices.getUserMedia(
          VOIP_AUDIO_CONSTRAINTS,
        )
        localStreamRef.current = localStream

        // RACE (FIX 2): the provider can unmount while the TURN fetch or the
        // mic prompt above was in flight. The unmount safety-net effect
        // (`useEffect(() => teardown, [teardown])`) already ran `teardown()`
        // at the moment of unmount — but against refs that were still empty,
        // since THIS continuation had not created its peer/mic yet. Left
        // unguarded, execution would carry on to build a real
        // `RTCPeerConnection` and acquire a real microphone track for a
        // component that no longer exists to ever tear them down — a live
        // mic with nothing rendering its controls. Check now, once both the
        // peer and the mic actually exist in the refs, and tear them down
        // ourselves if the component is gone. Nothing has been accepted
        // server-side yet at this point, so no compensating hangup is
        // needed — just a clean, unattached exit.
        if (!isMountedRef.current) {
          teardown()
          return
        }

        // Before the answer is built — see `attachMicrophone`. Nothing has been
        // accepted server-side yet, so this aborts the answer rather than
        // hanging up, but it must still tell the agent why the ring vanished.
        if (!attachMicrophone(pc, localStream)) {
          logger.error(
            { whatsappCallId },
            "WhatsApp VoIP answer aborted — the microphone yielded no audio track",
          )
          teardown()
          handleEnded(whatsappCallId, "connectionLost")
          return
        }

        await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp })

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
          // RACE #1 (FIX 1): Meta/our DB now say "accepted", but the local
          // call this was answering may no longer be resurrectable — either
          // the store's call slot was cleared/overwritten while this await
          // was in flight (dismissed, or a fresh incoming offer landed), or
          // Meta ENDED THIS SAME CALL server-side in the meantime: the
          // realtime `whatsappCallTransportEnded` handler already ran
          // `handleEnded` for this exact `whatsappCallId`, moving it to the
          // terminal `ended` phase. Same id, so a bare id-equality check here
          // would wrongly pass and resurrect an already-dead call — the mic
          // track would get attached to a call Meta considers over.
          // `markActive` itself refuses BOTH cases (mismatched id, and phase
          // `ended` — see `voip-call-store.ts`) and reports failure so both
          // races share one teardown/compensating-hangup path below instead
          // of duplicating it per case.
          //
          // RACE #2 (FIX 2): the provider can also have unmounted entirely
          // while this await was in flight — `isMountedRef` catches that even
          // though the store's call may still (harmlessly) report the id as
          // matching and not `ended`, since nothing in the store is
          // unmount-aware. Short-circuited before `markActive` so an
          // unmounted attempt never flips the store to `active` at all.
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

          // The mic is already attached and negotiated as `sendrecv` (see the
          // `addTrack` above), so there is nothing to wire up here — accept
          // simply opens the path Meta will send and receive audio on.
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
    },
    [
      workspaceId,
      setPhase,
      markActive,
      reset,
      teardown,
      maybeStartRecorder,
      setRecordingInStore,
      handleConnectionLost,
      handleEnded,
    ],
  )

  /**
   * Cancels a dial still `preparing` — no server-side call exists yet (see
   * `startOutbound`'s client-generated nonce), so there is nothing to hang
   * up against. Marks the attempt cancelled so `startOutbound`'s
   * still-in-flight async work fires a compensating hangup itself if Meta
   * ends up dialing anyway, tears the local peer/mic down, and releases the
   * slot. Shared by `hangup()` and `endForReplacement()` (see FIX 5 below)
   * so the exact same three steps never drift into two slightly different
   * copies.
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
   * Ends the call occupying the slot so a basket entry can replace it. Used
   * ONLY by `answer`'s replacement path, never by `hangup()`.
   *
   * `hangup()` tears down locally first and swallows a failed action — fine
   * when nothing waits on it, but here it could leave the FIRST customer in
   * dead air while the agent talks to the second. So this AWAITS the action
   * and only tears down once the server confirms `{ hungUp: true }`; on any
   * other outcome the existing call is untouched and it returns `false`, and
   * the caller aborts the replacement.
   *
   * Takes the whole call, not just an id: while `phase === "preparing"` the
   * `whatsappCallId` is still the client nonce from `startOutbound`, which
   * the action's `zodBigintAsString()` input rejects — that would show a
   * false "hangup failed" toast for a leg that was never dialed. `preparing`
   * therefore short-circuits to the local-only cancel.
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
   * Resolves and answers ONE offer, targeted either by id (a specific
   * basket entry, or the slot's own call) or — with no argument — whatever
   * currently occupies the slot (today's behavior, unchanged).
   *
   * Race #1 — stale closure: `promoteRinging` mutates the store directly, so
   * this render's captured `call` is stale the moment a basket entry is
   * promoted. Every decision below reads `getState()` fresh instead.
   *
   * Race #2 — concurrent answers: `answeringIdRef` is a synchronous mutex
   * set before any `await`, so a second `answer(...)` is a no-op while one
   * is in flight. Without it two rapid clicks could both reach the
   * replacement branch on stale reads, and the second could hang up the very
   * call the first had just promoted.
   *
   * Replacement: when the slot holds a genuinely ENGAGED call (not free —
   * see `isCallSlotFree`'s rule that a lingering `ended` call IS free) and
   * the target is a DIFFERENT, basket-resident call, the current call is
   * ended via `endForReplacement` (awaited, server-confirmed) before the
   * basket entry is ever promoted. A failed end aborts here: the ring stays
   * in the basket, nothing is promoted, nothing is torn down.
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

        // Case 1: the target already IS the slot's call, still ringing —
        // the common path (the panel's Answer button with no id, or a
        // basket entry taking an already-free slot after `promoteRinging`
        // below). Nothing to replace.
        if (
          latest.call?.whatsappCallId === targetId &&
          latest.call.phase === WhatsappVoipCallPhase.incomingRinging
        ) {
          await answerIncoming(latest.call)
          return
        }

        // Case 2: the target must be a basket entry.
        const ringing = latest.ringingCalls.find(
          (entry) => entry.whatsappCallId === targetId,
        )
        if (!ringing) {
          // Already answered elsewhere, expired, or dismissed between the
          // click and this point — nothing left to do.
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
          // Another agent won the race, or the slot filled again in the
          // window above — abort cleanly. A basket entry owns no peer/mic,
          // so there is nothing to tear down.
          //
          // But if we ENDED a live call to get here, the agent just lost a
          // real conversation for nothing. Failing silently would leave them
          // staring at an empty panel with no idea why, so say it plainly.
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

  // Ring-all: dismissing an incoming call is LOCAL only — the same offer is
  // rung to every available agent, so declining just silences it here and
  // leaves it ringing for the others. The call ends for everyone only when
  // someone answers, the caller hangs up, or the deadline lapses (the worker
  // then Meta-rejects it as missed). No server action here.
  const dismiss = useCallback(
    (whatsappCallId?: string) => {
      if (whatsappCallId) {
        // A basket entry owns no `RTCPeerConnection` and no mic track —
        // there is nothing to tear down, just an offer to drop.
        removeRinging(whatsappCallId)
        return
      }
      teardown()
      reset()
    },
    [removeRinging, teardown, reset],
  )

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

    // Cancel a dial still `preparing` — see `cancelPreparingAttempt`.
    if (call.phase === WhatsappVoipCallPhase.preparing) {
      cancelPreparingAttempt(call.whatsappCallId)
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
  }, [call, workspaceId, teardown, reset, handleEnded, cancelPreparingAttempt])

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
      // Deliberately checks ONLY the single `call` slot, never the basket
      // (`ringingCalls`) — an unanswered offer must not lock the agent out
      // of dialing someone else. This is unchanged from before the basket
      // existed, and stays unchanged on purpose: do not "fix" this to also
      // check `ringingCalls.length`. The ring itself remains fully
      // answerable afterwards regardless of what this dial does (it still
      // lives in the basket, disjoint from whatever `startOutbound` does to
      // the slot).
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
      // `teardown()` closes the SHARED peer/mic refs, which a DIFFERENT call
      // may already own by the time a cancelled attempt's async work finally
      // resolves. An agent can now replace a still-`preparing` dial by
      // answering an inbound ring (`endForReplacement`): that cancels this
      // attempt, closes ITS peer right then, and hands the slot to the ring,
      // which builds its own peer and microphone. A late `finishCancelled`
      // here would close that replacement's peer and stop its microphone,
      // leaving the agent connected to Meta with dead media. So tear down
      // only while this attempt still owns the slot — or while the slot is
      // empty, where there is nothing of anyone else's to break.
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

        setPreparingStage(nonce, "mic")
        const microphone = await captureMicrophoneStream()
        if ("failure" in microphone) {
          teardownIfStillOurs()
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
        localStreamRef.current = microphone.stream

        // Before the offer is built — see `attachMicrophone`.
        if (!attachMicrophone(pc, microphone.stream)) {
          teardownIfStillOurs()
          if (isCancelled()) {
            clearCancelToken()
            return "cancelled"
          }
          releaseIfStillPreparing()
          logger.error(
            "WhatsApp outbound VoIP dial aborted — the microphone yielded no audio track",
          )
          return "callFailed"
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
          teardownIfStillOurs()
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
          teardownIfStillOurs()
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
          teardownIfStillOurs()
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
        teardownIfStillOurs()
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

  // D7 — warn before a navigation/reload/close would silently drop a call
  // the agent is actively ENGAGED with: answering an offer, dialing out
  // (ringing or already connecting), or already on an active call.
  //
  // Deliberately does NOT cover a merely-ringing basket. Under ring-all an
  // offer reaches every online agent, so counting the basket made ANY
  // inbound call block navigation, reload and tab-close for every agent in
  // the workspace — including the ones with no intention of answering. And
  // it guarded nothing: the resume-after-refresh fetch above re-discovers
  // every still-unanswered offer on the next mount, so a reload mid-ring
  // loses nothing to warn about.
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
