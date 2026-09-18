"use client"

import { useQueryClient } from "@tanstack/react-query"
import type { RealtimeHandlerMap } from "@/features/realtime/types"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { useWorkspaceId } from "@/hooks/routing"
import { authClient } from "@/lib/auth/auth-client"
import { outboundCallModeQueryKeys } from "./outbound-call-mode-query-key"
import {
  useWhatsappVoipCallStore,
  WhatsappVoipCallPhase,
} from "./voip-call-store"

/**
 * The calling subscriber: registers the seven WhatsApp VoIP/call-routing
 * realtime events
 * against the single workspace socket (`WorkspaceRealtimeProvider`) instead
 * of opening one of its own. Voip store / query-client side effects only —
 * moved verbatim from the previous `ChatRealtime` `switch`, never rewritten.
 * Mounted globally (workspace layout, under `callingEnabled`), so it has no
 * dependency on `ChatStoreProvider` — see `use-whatsapp-voip-call-context`
 * for the parity tests that assert this.
 */
export function WhatsappCallRealtime() {
  const workspaceId = useWorkspaceId()
  const { data: session } = authClient.useSession()
  const currentUserId = session?.user.id
  const queryClient = useQueryClient()

  const enqueueRinging = useWhatsappVoipCallStore(
    (state) => state.enqueueRinging,
  )
  const removeRinging = useWhatsappVoipCallStore((state) => state.removeRinging)
  const removeRingingByConversationIds = useWhatsappVoipCallStore(
    (state) => state.removeRingingByConversationIds,
  )
  const handleVoipCallEnded = useWhatsappVoipCallStore(
    (state) => state.handleEnded,
  )
  const resetVoipCall = useWhatsappVoipCallStore((state) => state.reset)
  const setPendingOutboundAnswer = useWhatsappVoipCallStore(
    (state) => state.setPendingOutboundAnswer,
  )
  const setOutboundStatus = useWhatsappVoipCallStore(
    (state) => state.setOutboundStatus,
  )

  const handlers: RealtimeHandlerMap = {
    whatsappCallTransportIncoming: (event) => {
      const { data } = event
      // Ring-all: several offers can be outstanding for this agent at
      // once, so every incoming offer lands in the basket
      // (`ringingCalls`) rather than the single `call` slot directly —
      // `enqueueRinging` itself no-ops for an id already in the
      // basket or occupying the slot (a redelivered offer).
      enqueueRinging({
        whatsappCallId: data.whatsappCallId,
        wacid: data.wacid,
        conversationId: data.conversationId,
        contactInboxId: data.contactInboxId,
        contactName: data.contactName,
        offer: data.offer,
        deadlineAt: data.deadlineAt,
      })
    },
    whatsappCallTransportEnded: (event) => {
      const { data } = event
      // Drop the basket entry (a no-op if this call was never in the
      // basket — e.g. it was already promoted into the slot) AND
      // still run the existing slot-side handler, which lingers an
      // `ended` message for THIS agent if it was the one engaged with
      // the call.
      removeRinging(data.whatsappCallId)
      handleVoipCallEnded(data.whatsappCallId, data.status)
    },
    whatsappCallOutboundAnswer: (event) => {
      const { data } = event
      // The SDP answer for a call THIS agent initiated — never logged.
      // Handed off to the hook's own effect via the store rather than
      // applied here, since this component never touches the peer
      // connection directly.
      setPendingOutboundAnswer({
        whatsappCallId: data.whatsappCallId,
        sdp: data.session.sdp,
      })
    },
    whatsappCallOutboundStatus: (event) => {
      const { data } = event
      setOutboundStatus(data.whatsappCallId, data.status)
    },
    whatsappCallPermissionUpdated: (event) => {
      // A 138017-reconciled permanent grant (no `call_permission_reply`
      // message to piggyback on) — refetch the same query the reply
      // path invalidates so the header's call control flips to
      // direct-dial live.
      queryClient
        .invalidateQueries({
          queryKey: outboundCallModeQueryKeys.conversation(
            workspaceId,
            event.data.conversationId,
          ),
        })
        .catch(() => undefined)
    },
    whatsappCallClaimedElsewhere: (event) => {
      const { data } = event
      // Ring-all: broadcast to the whole workspace after another rung
      // agent's accept succeeds. Drop the basket entry unconditionally
      // — it is no longer offered to anyone (a no-op if it was never
      // in this agent's basket, e.g. it had already been promoted).
      removeRinging(data.whatsappCallId)
      // The winning agent already knows it won (it's mid-`answer`)
      // and must ignore its own event for the SLOT, or this would
      // clear the dialog out from under its own in-flight accept —
      // only a losing agent still `incomingRinging` for this exact
      // call in the slot clears its dialog. Kept as a safety net
      // alongside the basket removal above (the slot and basket are
      // disjoint, but a call could in principle still be sitting in
      // the slot here via an older/redelivered event ordering).
      // Silent local dismiss, like `dismiss` — losing a ring-all
      // race is not a terminal call event FROM THIS AGENT's point of
      // view (the call is still very much alive, just answered by a
      // colleague), so this bypasses `handleEnded`'s lingering `ended`
      // panel/message entirely.
      const currentCall = useWhatsappVoipCallStore.getState().call
      if (
        currentCall?.whatsappCallId === data.whatsappCallId &&
        currentCall.phase === WhatsappVoipCallPhase.incomingRinging &&
        currentUserId !== data.answeredByUserId
      ) {
        resetVoipCall()
      }
    },
    // P2 item 8: a conversation can be
    // reassigned to someone else WHILE it is still ringing this agent (the
    // worker's ring set was computed before the reassignment, or the
    // reassignment happened after delivery). Drop every basket entry for a
    // now-reassigned conversation so the dialog doesn't keep offering a
    // call this agent should no longer see. Assigned to THIS agent, or
    // unassigned (`assignedUserId: null` — no auto-claim by reassignment
    // either), never drops anything.
    conversationAssigned: (event) => {
      const { data } = event
      const assignedToSomeoneElse =
        data.assignedUserId !== null && data.assignedUserId !== currentUserId
      if (!assignedToSomeoneElse) {
        return
      }
      removeRingingByConversationIds(data.conversationIds)
    },
  }

  useWorkspaceRealtimeEvents(handlers)

  return null
}
