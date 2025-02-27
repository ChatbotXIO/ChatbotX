"use client"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useState } from "react"
import ConversationList from "../conversations/conversation-list"
import MessageList from "../messages/message-list"

export const InboxDetail = ({
  chatbotId,
  layout = [25, 50, 25],
}: {
  chatbotId: string
  layout: number[]
}) => {
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null)

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full max-h-[calc(100vh-48px)] items-stretch"
    >
      {/* CONVERSATION LIST */}
      <ResizablePanel
        defaultSize={layout[0] ?? 25}
        minSize={20}
        maxSize={30}
        className="p-3"
      >
        <ConversationList chatbotId={chatbotId} />
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* MESSAGE LIST */}
      <ResizablePanel defaultSize={layout[1] ?? 50} className="py-3">
        {activeConversationId ? (
          <MessageList
            chatbotId={chatbotId}
            conversationId={activeConversationId}
          />
        ) : (
          <div>No messages fouund</div>
        )}
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* CONTACT DETAIL */}
      <ResizablePanel
        defaultSize={layout[2] ?? 25}
        minSize={20}
        maxSize={30}
        className="p-3"
      >
        {/* {contact} */}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
