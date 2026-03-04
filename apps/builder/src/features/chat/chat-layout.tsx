"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@aha.chat/ui/components/ui/resizable"
import { BotIcon, Loader2Icon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ContactInboxPanel } from "../contacts/contact-inbox-panel"
import { disableBotAction } from "../conversations/actions/disable-bot.action"
import ConversationList from "../conversations/conversation-list"
import type { ConversationResource } from "../conversations/schemas/resource"
import { MessageInput } from "../messages/components/message-input"
import MessageHead from "../messages/message-head"
import { MessageList } from "../messages/message-list"
import { ChatRealtime } from "./chat-realtime"
import { useChatStore } from "./store/chat-store-provider"

type ChatLayoutProps = {
  layout?: [number, number, number]
}

export const ChatLayout = (props: ChatLayoutProps) => {
  const t = useTranslations()
  const { layout = [25, 50, 25] } = props
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const {
    conversations,
    isFirstLoadConversation,
    isLoadingConversation,
    activeConversationId,
    updateConversation,
  } = useChatStore((state) => state)

  const [activeConversation, setActiveConversation] =
    useState<ConversationResource | null>(null)

  const { execute: disableBot, isExecuting: isDisablingBot } = useAction(
    disableBotAction.bind(null, chatbotId),
    {
      onSuccess: () => {
        if (activeConversation) {
          updateConversation(activeConversation.id, {
            liveChatEnabled: true,
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

  useEffect(() => {
    const selectedConversation = conversations.find(
      (c) => c.id === activeConversationId,
    )
    setActiveConversation(selectedConversation ?? null)
  }, [activeConversationId, conversations])

  return (
    <ResizablePanelGroup className="h-full items-stretch">
      {/* CONVERSATION LIST */}
      <ResizablePanel
        className="p-3"
        defaultSize={`${layout[0] ?? 25}%`}
        maxSize={"30%"}
        minSize={"20%"}
      >
        <ConversationList />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* MESSAGE LIST */}
      <ResizablePanel className="pt-3" defaultSize={`${layout[1] ?? 50}%`}>
        {isFirstLoadConversation && isLoadingConversation && (
          <Loader2Icon className="mx-auto my-4 animate-spin" />
        )}
        {activeConversation && (
          <>
            <div className="flex h-full w-full flex-col">
              <MessageHead />
              {!activeConversation?.liveChatEnabled && (
                <Button
                  className="rounded-none"
                  disabled={isDisablingBot}
                  onClick={() => {
                    disableBot({ ids: [activeConversation.id] })
                  }}
                  variant="secondary"
                >
                  <BotIcon />
                  {t("messages.botIsActive")}
                </Button>
              )}
              <MessageList />
              <MessageInput />
            </div>

            <ChatRealtime />
          </>
        )}
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* CONTACT DETAIL */}
      <ResizablePanel
        className="overflow-y-auto! h-screen px-4 py-3"
        defaultSize={`${layout[2] ?? 25}%`}
        maxSize={"30%"}
        minSize={"20%"}
      >
        {isFirstLoadConversation && isLoadingConversation && (
          <Loader2Icon className="mx-auto my-4 animate-spin" />
        )}
        {activeConversation && <ContactInboxPanel />}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
