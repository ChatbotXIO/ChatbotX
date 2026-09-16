"use client"

import {
  type RealtimeEventData,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import { getWhatsappCallPermissionReply } from "@chatbotx.io/sdk"
import { useQueryClient } from "@tanstack/react-query"
import usePartySocket from "partysocket/react"
import { useWorkspaceId } from "@/hooks/routing"
import { authClient } from "@/lib/auth/auth-client"
import { client } from "@/lib/orpc/orpc"
import { outboundCallModeQueryKey } from "../integration-whatsapp/calling/voip/outbound-call-mode-query-key"
import {
  useWhatsappVoipCallStore,
  WhatsappVoipCallPhase,
} from "../integration-whatsapp/calling/voip/voip-call-store"
import type { MessageResourceWithRelations } from "../messages/schema/resource"
import { useTenantSettings } from "../tenant"
import { useChatStore } from "./store/chat-store-provider"

export function ChatRealtime() {
  const workspaceId = useWorkspaceId()
  const { wsUrl } = useTenantSettings()
  const { data: session } = authClient.useSession()
  const currentUserId = session?.user.id
  const queryClient = useQueryClient()
  const invalidateOutboundCallMode = (conversationId: string) =>
    queryClient.invalidateQueries({
      queryKey: outboundCallModeQueryKey(workspaceId, conversationId),
    })

  const {
    handleNewMessage,
    markMessagesDeleted,
    markMessageFailed,
    assignMessageCommentId,
    updateMessageText,
    updateMessageContentAttributes,
    updateContact,
    updateConversations,
    bubbleConversationToTop,
  } = useChatStore((state) => state)
  const addVoipIncoming = useWhatsappVoipCallStore((state) => state.addIncoming)
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

  usePartySocket({
    host: wsUrl,
    room: workspaceId,
    party: "workspaces",
    // protocol: "ws",

    query: async () => {
      // Short-lived token bound to this member and workspace room — the
      // `workspaces` party rejects the upgrade for any other room.
      const { token } =
        await client.realtimeAPI.mintWorkspaceConnectTokenAuthenticatedAPI({
          workspaceId,
        })

      return { token }
    },

    // onOpen() {},
    onMessage(e) {
      try {
        const { eventType, data } = JSON.parse(e.data) as RealtimeEventData
        switch (eventType) {
          case RealtimeEventType.messageCreated: {
            const message = data as MessageResourceWithRelations
            handleNewMessage(message)
            // A customer's call-permission reply (accept/reject) changes what
            // the VoIP call button should do, but `useOutboundCallMode` caches
            // its resolution per conversation (staleTime) and would otherwise
            // keep showing the pre-accept "request permission" affordance until
            // a remount. Invalidate that query so the button reflects the new
            // grant on the next render, live.
            if (getWhatsappCallPermissionReply(message.contentAttributes)) {
              invalidateOutboundCallMode(message.conversationId)
            }
            break
          }
          case RealtimeEventType.messageDeleted:
            markMessagesDeleted(data.messageIds)
            break
          case RealtimeEventType.messageIdAssigned:
            assignMessageCommentId(data.messageId, data.commentId)
            break
          case RealtimeEventType.messageFailed:
            markMessageFailed(data.messageId, data.clientId, data.error)
            break
          case RealtimeEventType.messageUpdated:
            updateMessageText(data.messageId, data.newText, {
              newAttachmentPath: data.newAttachmentPath ?? null,
              newAttachmentPublicUrl: data.newAttachmentPublicUrl ?? null,
              newAttachmentMimeType: data.newAttachmentMimeType ?? null,
              newAttachmentWidth: data.newAttachmentWidth,
              newAttachmentHeight: data.newAttachmentHeight,
              removedAttachment: data.removedAttachment ?? false,
            })
            break
          case RealtimeEventType.messageContentUpdated:
            updateMessageContentAttributes(
              data.messageId,
              data.contentAttributes,
            )
            break
          case RealtimeEventType.contactBlocked:
            updateContact(data.contactId, {
              blockedAt: new Date(),
            })
            break
          case RealtimeEventType.contactUnblocked:
            updateContact(data.contactId, {
              blockedAt: null,
            })
            break
          case RealtimeEventType.conversationAssigned:
            updateConversations(data.conversationIds, {
              assignedUserId: data.assignedUserId,
              assignedInboxTeamId: data.assignedInboxTeamId,
            })
            break
          case RealtimeEventType.whatsappCallTransportIncoming:
            addVoipIncoming({
              whatsappCallId: data.whatsappCallId,
              wacid: data.wacid,
              conversationId: data.conversationId,
              contactInboxId: data.contactInboxId,
              contactName: data.contactName,
              offer: data.offer,
              deadlineAt: data.deadlineAt,
            })
            // Surface the ringing conversation at the top of the inbox
            // list — a purely visual reorder (see `bubbleConversationToTop`).
            bubbleConversationToTop(workspaceId, data.conversationId).catch(
              () => undefined,
            )
            break
          case RealtimeEventType.whatsappCallTransportEnded:
            handleVoipCallEnded(data.whatsappCallId, data.status)
            break
          case RealtimeEventType.whatsappCallOutboundAnswer:
            // The SDP answer for a call THIS agent initiated — never logged.
            // Handed off to the hook's own effect via the store rather than
            // applied here, since this component never touches the peer
            // connection directly.
            setPendingOutboundAnswer({
              whatsappCallId: data.whatsappCallId,
              sdp: data.session.sdp,
            })
            break
          case RealtimeEventType.whatsappCallOutboundStatus:
            setOutboundStatus(data.whatsappCallId, data.status)
            break
          case RealtimeEventType.whatsappCallPermissionUpdated:
            // A 138017-reconciled permanent grant (no `call_permission_reply`
            // message to piggyback on) — refetch the same query the reply
            // path invalidates so the header's call control flips to
            // direct-dial live.
            invalidateOutboundCallMode(data.conversationId)
            break
          case RealtimeEventType.whatsappCallClaimedElsewhere: {
            // Ring-all: broadcast to the whole workspace after another rung
            // agent's accept succeeds. The winning agent already knows it
            // won (it's mid-`answer`) and must ignore its own event, or
            // this would clear the dialog out from under its own in-flight
            // accept — only a losing agent still
            // `incomingRinging` for this exact call clears its dialog.
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
            break
          }
          default:
            break
        }
      } catch (error) {
        console.error("Unable to parse realtime message", error)
      }
    },
    // onClose {},
    // onError {},
  })

  return <div />
}
