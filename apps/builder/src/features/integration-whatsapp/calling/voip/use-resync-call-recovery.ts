"use client"

import { useEffect, useRef } from "react"
import { useWorkspaceRealtimeContext } from "@/features/realtime/workspace-realtime-provider"
import { useWorkspaceId } from "@/hooks/routing"
import { logger } from "@/lib/log"
import { getOutboundVoipAnswerAction } from "../actions/get-outbound-voip-answer.action"
import { getPendingIncomingVoipCallAction } from "../actions/get-pending-incoming-voip-call.action"
import {
  useWhatsappVoipCallStore,
  type WhatsappVoipCall,
  WhatsappVoipCallDirection,
  WhatsappVoipCallPhase,
} from "./voip-call-store"

/**
 * Outbound phases in which the peer may still lack the customer's SDP answer.
 * `active` is included: Meta's ACCEPTED status can arrive while the answer
 * push was lost, leaving a "connected" call with no media.
 */
const OUTBOUND_PHASES_AWAITING_ANSWER: ReadonlySet<WhatsappVoipCallPhase> =
  new Set<WhatsappVoipCallPhase>([
    WhatsappVoipCallPhase.outboundDialing,
    WhatsappVoipCallPhase.outboundRinging,
    WhatsappVoipCallPhase.active,
  ])

const isOutboundAwaitingAnswer = (call: WhatsappVoipCall | null): boolean =>
  call?.direction === WhatsappVoipCallDirection.outbound &&
  OUTBOUND_PHASES_AWAITING_ANSWER.has(call.phase)

/**
 * Both the incoming ring and an outbound call's SDP answer are delivered once,
 * over realtime. When the gateway could not replay what this tab missed
 * (`resyncCount` bumps), the state they feed is reloaded from the server here.
 */
export function useResyncCallRecovery(): void {
  const workspaceId = useWorkspaceId()
  const { resyncCount } = useWorkspaceRealtimeContext()
  const reconcileRinging = useWhatsappVoipCallStore(
    (state) => state.reconcileRinging,
  )
  const setPendingOutboundAnswer = useWhatsappVoipCallStore(
    (state) => state.setPendingOutboundAnswer,
  )

  // The ids already ringing are snapshotted before the request: an offer that
  // arrives while it is in flight is newer than the server's answer and must
  // survive.
  useEffect(() => {
    if (resyncCount === 0) {
      return
    }
    let isCancelled = false
    const staleCandidateIds = new Set(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((ringing) => ringing.whatsappCallId),
    )
    getPendingIncomingVoipCallAction(workspaceId)
      .then((result) => {
        // A failed action carries no `data`; treating it as an empty list would
        // wipe every live ring.
        if (isCancelled || result?.data === undefined) {
          return
        }
        reconcileRinging({
          isServerListComplete: result.data.isComplete,
          serverCalls: result.data.calls,
          staleCandidateIds,
        })
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error },
          "WhatsApp VoIP ring reload after realtime resync failed",
        )
      })
    return () => {
      isCancelled = true
    }
  }, [resyncCount, workspaceId, reconcileRinging])

  // The call, if any, whose answer this tab may be missing. Subscribing to it
  // (not just reading it at resync time) lets a resync that landed while the
  // call was still `preparing` be recovered once the call gets its real id.
  const awaitingAnswerCallId = useWhatsappVoipCallStore((state) =>
    isOutboundAwaitingAnswer(state.call) ? state.call?.whatsappCallId : null,
  )
  const recoveredResyncCountRef = useRef(0)

  useEffect(() => {
    if (resyncCount === recoveredResyncCountRef.current) {
      return
    }
    const call = useWhatsappVoipCallStore.getState().call
    const isStillPreparing =
      call?.direction === WhatsappVoipCallDirection.outbound &&
      call.phase === WhatsappVoipCallPhase.preparing
    if (isStillPreparing) {
      // Meta's answer can land right after initiation: wait for the real call
      // id, which re-runs this effect through `awaitingAnswerCallId`.
      return
    }
    if (!awaitingAnswerCallId) {
      recoveredResyncCountRef.current = resyncCount
      return
    }
    let isCancelled = false
    getOutboundVoipAnswerAction(workspaceId, {
      whatsappCallId: awaitingAnswerCallId,
    })
      .then((result) => {
        const sdp = result?.data?.sdp
        // The call may have ended or been replaced while the request ran; a
        // buffered answer for it would only linger.
        const isStillThisCall =
          useWhatsappVoipCallStore.getState().call?.whatsappCallId ===
          awaitingAnswerCallId
        if (isCancelled || !isStillThisCall) {
          return
        }
        recoveredResyncCountRef.current = resyncCount
        if (sdp) {
          setPendingOutboundAnswer({
            whatsappCallId: awaitingAnswerCallId,
            sdp,
          })
        }
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error, whatsappCallId: awaitingAnswerCallId },
          "WhatsApp VoIP outbound answer recovery after realtime resync failed",
        )
      })
    return () => {
      isCancelled = true
    }
  }, [resyncCount, awaitingAnswerCallId, workspaceId, setPendingOutboundAnswer])
}
