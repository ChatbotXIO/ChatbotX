"use client"

import { useQueryClient } from "@tanstack/react-query"
import type { RealtimeHandlerMap } from "@/features/realtime/types"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { useWorkspaceId } from "@/hooks/routing"
import { authClient } from "@/lib/auth/auth-client"
import { outboundCallModeQueryKeys } from "./outbound-call-mode-query-key"
import { useWhatsappVoipCallStore } from "./voip-call-store"

/**
 * Registers the WhatsApp VoIP/call-routing realtime events on the shared
 * workspace socket. Mounted globally under callingEnabled, independent of
 * ChatStoreProvider.
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
  const dismissRinging = useWhatsappVoipCallStore(
    (state) => state.dismissRinging,
  )
  const removeRingingByConversationIds = useWhatsappVoipCallStore(
    (state) => state.removeRingingByConversationIds,
  )
  const handleVoipCallEnded = useWhatsappVoipCallStore(
    (state) => state.handleEnded,
  )
  const setPendingOutboundAnswer = useWhatsappVoipCallStore(
    (state) => state.setPendingOutboundAnswer,
  )
  const setOutboundStatus = useWhatsappVoipCallStore(
    (state) => state.setOutboundStatus,
  )

  const handlers: RealtimeHandlerMap = {
    whatsappCallTransportIncoming: (event) => {
      const { data } = event
      // Ring-all: every incoming offer lands in the basket (ringingCalls),
      // not the single call slot; enqueueRinging no-ops for a redelivered id.
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
      // Drop the basket entry (no-op if already promoted into the slot) and
      // still run the slot-side handler, which lingers an ended message if
      // this agent was engaged.
      removeRinging(data.whatsappCallId)
      handleVoipCallEnded(data.whatsappCallId, data.status)
    },
    whatsappCallOutboundAnswer: (event) => {
      const { data } = event
      // The SDP answer for a call this agent initiated; handed off via the
      // store since this component doesn't touch the peer connection.
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
      // A permanent grant with no call_permission_reply message to piggyback
      // on - refetch the same query the reply path invalidates so the
      // header's call control flips to direct-dial live.
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
      // Ring-all: broadcast workspace-wide once another rung agent's accept
      // succeeds. The tab that won is already past incomingRinging -
      // answerIncoming moves it to answering before its first await - so the
      // phase alone protects its in-flight accept. Filtering on the user as
      // well would leave the winner's other tabs ringing, since they share its
      // user id.
      dismissRinging(event.data.whatsappCallId)
    },
    // A conversation can be reassigned while still ringing this agent (the
    // worker's ring set predates the reassignment). Drop the basket entries
    // so the dialog stops offering a call this agent shouldn't see.
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
