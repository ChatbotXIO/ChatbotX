'use client'

import { Button } from "@/components/ui/button"
import { ChatBubble, ChatBubbleAction, ChatBubbleActionWrapper, ChatBubbleAvatar, ChatBubbleMessage } from "@/components/ui/chat/chat-bubble"
import { ChatInput } from "@/components/ui/chat/chat-input"
import { cn } from "@/lib/utils"
import { SenderType } from "@ahachat.ai/database"
import { File, Heart, PaperclipIcon, PlusCircle, Reply, SendIcon } from "lucide-react"
import { Virtuoso } from "react-virtuoso"
import { Message } from "../inbox/interfaces/message"
import MessageItem from "./message-item"

interface MessagesProps {
  messages: Message[]
}

const actionIcons = [
  {
    icon: Heart,
    type: 'emoticons'
  },
  {
    icon: Reply,
    type: 'replay'
  }
]

export default function MessageList({ messages }: MessagesProps) {
  const getPositionClasses = (senderType: SenderType): string => {
    if (senderType === "Contact" as SenderType) {
      return "justify-end"
    }

    if (senderType === "System" as SenderType) {
      return "justify-center"
    }

    return ""
  }

  const getMessageDirection = (senderType: SenderType): "sent" | "received" | null | undefined => {
    if (senderType === "Contact" as SenderType) {
      return "sent"
    }

    if (senderType === "System" as SenderType) {
      return null
    }

    return "received"
  }

  return (
    <>
      <div className="h-full flex flex-col p-2">
        <Virtuoso
          className="flex-1"
          data={messages}
          initialTopMostItemIndex={messages.length - 1}
          itemContent={(_, item) => (
            <div className={cn("flex mb-1 max-h-[60%]", getPositionClasses(item.senderType))}>
              <ChatBubble variant={getMessageDirection(item.senderType)} key={item.id} className="items-center">
                <ChatBubbleAvatar fallback={item.user.firstName} src={item.user.avatar} />
                <ChatBubbleMessage
                  isLoading={item.isLoading}
                  variant={getMessageDirection(item.senderType)}
                  className={cn(
                    item.messageType === 'text' || item.messageType === 'file' ? 'rounded-md' : 'p-0 bg-transparent'
                  )}
                >
                  <MessageItem message={item} />
                </ChatBubbleMessage>
                {/* Action Icons */}
                <ChatBubbleActionWrapper>
                  {
                    actionIcons.map(({ icon: Icon, type }) => (
                      <ChatBubbleAction
                        className="size-7"
                        key={type}
                        icon={<Icon className="size-4" />}
                      />
                    ))
                  }
                </ChatBubbleActionWrapper>
              </ChatBubble>
            </div>
          )}
        />
        <form className="flex items-center gap-2 mt-3">
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <PlusCircle size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <File size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <PaperclipIcon size={20} />
          </Button>
          <div
            className="relative rounded-full w-full border bg-background focus-within:ring-1 focus-within:ring-ring h-auto">
            <ChatInput
              placeholder="Type your message here..."
              className="min-h-12 resize-none rounded-full bg-background border-0 p-3 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button size="icon" variant="ghost">
            <SendIcon size={20} />
          </Button>
        </form>
      </div>
    </>
  )
}
