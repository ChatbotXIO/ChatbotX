"use client"

import { useAction } from "next-safe-action/hooks"
import { useCallback } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { disableBotAction } from "@/features/conversations/actions/disable-bot.action"
import {
  BOT_DISABLE_DURATION_MS,
  isConversationActive,
} from "@/features/conversations/utils/bot-state"
import { useWorkspaceId } from "@/hooks/routing"
import { useSendQueueRunner } from "../lib/use-send-queue-runner"

/**
 * Mounted once beside `ChatRealtime`, outside the panes: on mobile the message
 * pane unmounts when the user goes back to the list, and queued messages must
 * keep going out. Once the server has queued a message, a human reply pauses
 * the conversation's bot.
 */
export function SendQueueRunner() {
  const workspaceId = useWorkspaceId()
  const conversations = useChatStore((state) => state.conversations)
  const updateConversation = useChatStore((state) => state.updateConversation)

  const { execute: disableBot } = useAction(
    disableBotAction.bind(null, workspaceId),
    {
      onSuccess: ({ input }) => {
        for (const id of input.ids) {
          updateConversation(id, {
            botEnabled: false,
            botResumeAt: new Date(Date.now() + BOT_DISABLE_DURATION_MS),
          })
        }
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const onSubmitted = useCallback(
    (conversationId: string) => {
      const target = conversations.find((item) => item.id === conversationId)
      if (target && isConversationActive(target)) {
        disableBot({ ids: [target.id] })
      }
    },
    [conversations, disableBot],
  )

  useSendQueueRunner({ onSubmitted })
  return null
}
