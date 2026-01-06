"use client"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@aha.chat/ui/components/ui/resizable"
import { ContactInboxPanel } from "../contacts/contact-inbox-panel"
import ConversationList from "../conversations/conversation-list"
import { MessageInput } from "../messages/components/message-input"
import MessageHead from "../messages/message-head"
import { MessageList } from "../messages/message-list"
import { ChatRealtime } from "./chat-realtime"
import { ChatStoreProvider } from "./store/chat-store-provider"

type ChatLayoutProps = {
  layout?: [number, number, number]
}

export const ChatLayout = (props: ChatLayoutProps) => {
  const { layout = [25, 50, 25] } = props

  return (
    <ChatStoreProvider>
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
          <div className="flex h-full w-full flex-col">
            <MessageHead />
            <MessageList />
            <MessageInput />
          </div>

          <ChatRealtime />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* CONTACT DETAIL */}
        <ResizablePanel
          className="overflow-y-auto! h-screen px-4 py-3"
          defaultSize={`${layout[2] ?? 25}%`}
          maxSize={"30%"}
          minSize={"20%"}
        >
          <ContactInboxPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </ChatStoreProvider>
  )
}
