"use client"

import {
  type RealtimeEventData,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import usePartySocket from "partysocket/react"
import { useWorkspaceId } from "@/hooks/routing"
import { authClient } from "@/lib/auth/auth-client"
import type { MessageResourceWithRelations } from "../messages/schema/resource"
import { useTenantSettings } from "../tenant"
import { useChatStore } from "./store/chat-store-provider"

export function ChatRealtime() {
  const workspaceId = useWorkspaceId()
  const { wsUrl } = useTenantSettings()

  const { handleNewMessage, updateContact, updateConversations } = useChatStore(
    (state) => state,
  )

  usePartySocket({
    host: wsUrl,
    room: workspaceId,
    party: "workspaces",
    // protocol: "ws",

    query: async () => {
      const oneTimeToken = await authClient.oneTimeToken.generate()

      return {
        token: oneTimeToken.data?.token,
      }
    },

    // onOpen() {},
    onMessage(e) {
      try {
        const { eventType, data } = JSON.parse(e.data) as RealtimeEventData
        switch (eventType) {
          case RealtimeEventType.messageCreated:
            handleNewMessage(data as MessageResourceWithRelations)
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
          default:
            break
        }
      } catch (error) {
        console.error("Unable to parse realtime message", error)
      }
    },
    // onClose() {},
    // onError() {},
  })

  return <div />
}
