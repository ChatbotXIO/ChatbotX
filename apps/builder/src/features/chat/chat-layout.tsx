"use client"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@aha.chat/ui/components/ui/resizable"
import { BotIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { ContactInboxPanel } from "../contacts/contact-inbox-panel"
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

  const {
    conversations,
    isFirstLoadConversation,
    isLoadingConversation,
    activeConversationId,
  } = useChatStore((state) => state)

  const [activeConversation, setActiveConversation] =
    useState<ConversationResource | null>(null)

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
                <div className="flex items-center justify-center gap-2 bg-secondary py-1.5 align-center text-sm">
                  <BotIcon />
                  {t("messages.botIsActive")}
                </div>
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
