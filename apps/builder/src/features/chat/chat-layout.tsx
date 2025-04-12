"use client"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ContactInboxPanel } from "../contacts/contact-inbox-panel"
import ConversationList from "../conversations/conversation-list"
import { MessageInput } from "../messages/message-input"
import { MessageList } from "../messages/message-list"
import { useChatStore } from "./store/chat-store-provider"
import usePartySocket from "partysocket/react"
import { useParams } from "next/navigation"
import { PartySocketEvent } from "@ahachat.ai/party-config"
import type { MessageResource } from "../messages/schemas/list-messages.schema"

export const ChatLayout = ({
  layout = [25, 50, 25],
}: {
  layout: number[]
}) => {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { handleNewMessage } = useChatStore((state) => state)
  const _ws = usePartySocket({
    host: "localhost:1999", // or localhost:1999 in dev
    room: chatbotId,
    party: "chatbots",

    onOpen() {
      console.log("connected")
    },
    onMessage(e) {
      const { event, data } = JSON.parse(e.data) as {
        event: PartySocketEvent
        data: MessageResource
      }
      switch (event) {
        case PartySocketEvent.CREATE_MESSAGE:
          handleNewMessage(data as MessageResource)
          break
      }
    },
    onClose() {
      console.log("closed")
    },
    onError() {
      console.log("error")
    },
  })

  return (
    <>
      <ResizablePanelGroup
        direction="horizontal"
        className="h-full items-stretch"
      >
        {/* CONVERSATION LIST */}
        <ResizablePanel
          defaultSize={layout[0] ?? 25}
          minSize={20}
          maxSize={30}
          className="p-3"
        >
          <ConversationList />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* MESSAGE LIST */}
        <ResizablePanel defaultSize={layout[1] ?? 50} className="pt-3">
          <div className="flex flex-col w-full h-full">
            <MessageList />
            <MessageInput />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* CONTACT DETAIL */}
        <ResizablePanel
          defaultSize={layout[2] ?? 25}
          minSize={20}
          maxSize={30}
          className="px-4 py-3"
        >
          <ContactInboxPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  )
}
