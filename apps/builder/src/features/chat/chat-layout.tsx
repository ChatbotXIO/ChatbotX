"use client"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import ConversationList from "../conversations/conversation-list"
import { MessageInput } from "../messages/message-input"
import { MessageList } from "../messages/message-list"
import { ChatStoreProvider } from "./store/chat-store-provider"

export const ChatLayout = ({
  layout = [25, 50, 25],
}: {
  layout: number[]
}) => {
  // const ws = usePartySocket({
  //   // usePartySocket takes the same arguments as PartySocket.
  //   host: "project-name.username.partykit.dev", // or localhost:1999 in dev
  //   room: "my-room",

  //   // in addition, you can provide socket lifecycle event handlers
  //   // (equivalent to using ws.addEventListener in an effect hook)
  //   onOpen() {
  //     console.log("connected");
  //   },
  //   onMessage(e) {
  //     console.log("message", e.data);
  //   },
  //   onClose() {
  //     console.log("closed");
  //   },
  //   onError(e) {
  //     console.log("error");
  //   }
  // });

  return (
    <ChatStoreProvider>
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
          className="p-3"
        >
          {/* {contact} */}
        </ResizablePanel>
      </ResizablePanelGroup>
    </ChatStoreProvider>
  )
}
