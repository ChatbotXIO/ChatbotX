"use client"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ContactInboxPanel } from "../contacts/contact-inbox-panel"
import ConversationList from "../conversations/conversation-list"
import { MessageInput } from "../messages/components/message-input"
import { MessageList } from "../messages/message-list"
import { ChatStoreProvider } from "./store/chat-store-provider"
import { ChatRealtime } from "./chat-realtime"
import MessageHead from "../messages/message-head"

export const ChatLayout = ({
  layout = [25, 50, 25],
}: {
  layout: number[]
}) => {
  return (
    <ChatStoreProvider>
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
            <MessageHead />
            <MessageList />
            <MessageInput />
          </div>

          <ChatRealtime />
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
    </ChatStoreProvider>
  )
}
