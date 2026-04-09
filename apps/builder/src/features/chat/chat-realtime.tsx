"use client"

import {
  realtimeEvents,
  realtimeEventTypes,
} from "@chatbotx.io/partysocket-config"
import usePartySocket from "partysocket/react"
import { env } from "@/env"
import { useWorkspaceId } from "@/hooks/routing"
import { authClient } from "@/lib/auth/auth-client"
import type { MessageResourceWithRelations } from "../messages/schema/resource"
import { useChatStore } from "./store/chat-store-provider"

export function ChatRealtime() {
  const workspaceId = useWorkspaceId()

  const { handleNewMessage, updateContact, bulkUpdateConversations } =
    useChatStore((state) => state)

  usePartySocket({
    host: env.NEXT_PUBLIC_PARTYSOCKET_URL,
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
        const { eventType, data } = realtimeEvents.parse(JSON.parse(e.data))
        switch (eventType) {
          case realtimeEventTypes.enum.messageCreated:
            handleNewMessage(data as MessageResourceWithRelations)
            break
          case realtimeEventTypes.enum.contactBlocked:
            updateContact(data.contactId, {
              blockedAt: new Date(),
            })
            break
          case realtimeEventTypes.enum.contactUnblocked:
            updateContact(data.contactId, {
              blockedAt: null,
            })
            break
          case realtimeEventTypes.enum.conversationAssigned:
            bulkUpdateConversations(data.conversationIds, {
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
