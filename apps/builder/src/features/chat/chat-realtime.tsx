"use client"

import { getWhatsappCallPermissionReply } from "@chatbotx.io/sdk"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import type { RealtimeHandlerMap } from "@/features/realtime/types"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { useWorkspaceId } from "@/hooks/routing"
import { createBoundedSeenSet } from "@/lib/bounded-seen-set"
import { useConversationIdParam } from "../conversations/hooks/use-conversation-id-param"
import { outboundCallModeQueryKeys } from "../integration-whatsapp/calling/voip/outbound-call-mode-query-key"
import { useWhatsappVoipCallStore } from "../integration-whatsapp/calling/voip/voip-call-store"
import type { MessageResourceWithRelations } from "../messages/schema/resource"
import { useChatStore } from "./store/chat-store-provider"

/** Cap for the bubble-to-top dedupe set below. */
const SEEN_WHATSAPP_CALL_IDS_CAPACITY = 500

/** Registers this component's chat event handlers against the shared workspace realtime socket. */
export function ChatRealtime() {
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const invalidateOutboundCallMode = (conversationId: string) =>
    queryClient.invalidateQueries({
      queryKey: outboundCallModeQueryKeys.conversation(
        workspaceId,
        conversationId,
      ),
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
    applyAgentLastReadAt,
    bubbleConversationToTop,
    openConversation,
  } = useChatStore((state) => state)
  const conversationIdParam = useConversationIdParam()

  // Dedupes newly-ringing calls so each bubbles the conversation to top only
  // once. Held in a ref (not created inside the effect) so Strict Mode's
  // double setup/cleanup doesn't reset it and re-bubble already-seen entries;
  // bounded because this component stays mounted for the whole inbox session.
  const seenWhatsappCallIdsRef = useRef(
    createBoundedSeenSet<string>(SEEN_WHATSAPP_CALL_IDS_CAPACITY),
  )
  // Held in a ref rather than useEffectEvent: the zustand subscribe callback
  // fires from the store, not React's effect commit phase.
  const bubbleRingingConversationRef = useRef((conversationId: string) =>
    bubbleConversationToTop(workspaceId, conversationId).catch(() => undefined),
  )
  useEffect(() => {
    bubbleRingingConversationRef.current = (conversationId: string) =>
      bubbleConversationToTop(workspaceId, conversationId).catch(
        () => undefined,
      )
  }, [workspaceId, bubbleConversationToTop])

  useEffect(() => {
    const bubbleNewEntries = (
      ringingCalls: ReturnType<
        typeof useWhatsappVoipCallStore.getState
      >["ringingCalls"],
    ) => {
      for (const ringingCall of ringingCalls) {
        if (seenWhatsappCallIdsRef.current.has(ringingCall.whatsappCallId)) {
          continue
        }
        seenWhatsappCallIdsRef.current.add(ringingCall.whatsappCallId)
        bubbleRingingConversationRef.current(ringingCall.conversationId)
      }
    }

    bubbleNewEntries(useWhatsappVoipCallStore.getState().ringingCalls)
    return useWhatsappVoipCallStore.subscribe((state) => {
      bubbleNewEntries(state.ringingCalls)
    })
    // Runs once per mount; the ref above always forwards to the latest values.
  }, [])

  // WhatsappCallPanel (mounted outside ChatStoreProvider) can't call
  // chatStore.openConversation directly, so it sets pendingConversationOpen on
  // the module-level voip store; this component bridges that into a real
  // selection and syncs the conversationId URL param. The param is synced only
  // after openConversation resolves true, since syncing eagerly can race a
  // concurrent initActiveConversationFromUrl bootstrap.
  const openPendingRef = useRef((conversationId: string) => {
    openConversation(workspaceId, conversationId)
      .then((succeeded) => {
        if (succeeded) {
          conversationIdParam.set(conversationId)
        }
      })
      .catch(() => undefined)
  })
  useEffect(() => {
    openPendingRef.current = (conversationId: string) => {
      openConversation(workspaceId, conversationId)
        .then((succeeded) => {
          if (succeeded) {
            conversationIdParam.set(conversationId)
          }
        })
        .catch(() => undefined)
    }
  }, [workspaceId, openConversation, conversationIdParam])

  useEffect(() => {
    // consumePendingConversationOpen atomically reads-and-clears (avoids a
    // duplicate consume under Strict Mode's double setup) and drops requests
    // older than PENDING_CONVERSATION_OPEN_MAX_AGE_MS.
    const consumeIfPending = () => {
      const conversationId = useWhatsappVoipCallStore
        .getState()
        .consumePendingConversationOpen()
      if (conversationId) {
        openPendingRef.current(conversationId)
      }
    }

    if (useWhatsappVoipCallStore.getState().pendingConversationOpen) {
      consumeIfPending()
    }
    return useWhatsappVoipCallStore.subscribe((state) => {
      if (state.pendingConversationOpen) {
        consumeIfPending()
      }
    })
    // Same reasoning as the ringing-basket effect above: the ref always
    // forwards to the latest values, so this only needs to run once per mount.
  }, [])

  const handlers: RealtimeHandlerMap = {
    messageCreated: (event) => {
      const message = event.data as MessageResourceWithRelations
      handleNewMessage(message)
      // A customer's call-permission reply changes what the VoIP call button
      // should do, but useOutboundCallMode caches its resolution per
      // conversation and would otherwise keep showing the pre-accept affordance
      // until a remount. Invalidate the query so the button reflects the new
      // grant live.
      if (getWhatsappCallPermissionReply(message.contentAttributes)) {
        invalidateOutboundCallMode(message.conversationId)
      }
    },
    messageDeleted: (event) => {
      markMessagesDeleted(event.data.messageIds)
    },
    messageIdAssigned: (event) => {
      assignMessageCommentId(event.data.messageId, event.data.commentId)
    },
    messageFailed: (event) => {
      markMessageFailed(
        event.data.messageId,
        event.data.clientId,
        event.data.error,
      )
    },
    messageUpdated: (event) => {
      const { data } = event
      updateMessageText(data.messageId, data.newText, {
        newAttachmentPath: data.newAttachmentPath ?? null,
        newAttachmentPublicUrl: data.newAttachmentPublicUrl ?? null,
        newAttachmentMimeType: data.newAttachmentMimeType ?? null,
        newAttachmentWidth: data.newAttachmentWidth,
        newAttachmentHeight: data.newAttachmentHeight,
        removedAttachment: data.removedAttachment ?? false,
      })
    },
    messageContentUpdated: (event) => {
      updateMessageContentAttributes(
        event.data.messageId,
        event.data.contentAttributes,
      )
    },
    contactBlocked: (event) => {
      updateContact(event.data.contactId, { blockedAt: new Date() })
    },
    contactUnblocked: (event) => {
      updateContact(event.data.contactId, { blockedAt: null })
    },
    conversationAssigned: (event) => {
      const { data } = event
      updateConversations(data.conversationIds, {
        assignedUserId: data.assignedUserId,
        assignedInboxTeamId: data.assignedInboxTeamId,
        assignedUser: null,
        assignedInboxTeam: null,
      })
    },
    conversationUpdated: (event) => {
      const { conversationIds, changes } = event.data
      // This channel only advances read state. Cross-tab mark-unread (null) is
      // intentionally unsupported, matching the existing behavior.
      if (!changes.agentLastReadAt) {
        return
      }
      const agentLastReadAt = new Date(changes.agentLastReadAt)
      if (Number.isNaN(agentLastReadAt.getTime())) {
        return
      }
      applyAgentLastReadAt(conversationIds, agentLastReadAt)
    },
  }

  useWorkspaceRealtimeEvents(handlers)

  return <div />
}
