'use client'

import { cn } from "@/lib/utils";
import { ChatBubble, ChatBubbleAvatar, ChatBubbleMessage, ChatBubbleActionWrapper, ChatBubbleAction } from "@/components/ui/chat/chat-bubble";
import { ChatInput } from "@/components/ui/chat/chat-input";
import { Button } from "@/components/ui/button";
import { CornerDownLeft, PlusCircle, File, PaperclipIcon, Heart, Reply } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { Message } from "./interfaces/message";
import MessageItem from "@/features/inbox/message-item";

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

export default function Messages({ messages }: MessagesProps) {
  return (
    <>
      <div className="h-full max-h-[calc(100%-74px)]">
        <Virtuoso
          data={messages}
          initialTopMostItemIndex={messages.length - 1}
          itemContent={(_, item) => (
            <div className={cn("flex mb-1", item.direction === 'sent' ? 'justify-end' : '' )}>
              <ChatBubble variant={item.direction} key={item.id} className="items-center">
                <ChatBubbleAvatar fallback={item.user.firstName} src={item.user.avatar}/>
                <ChatBubbleMessage
                  isLoading={item.isLoading}
                  variant={item.direction}
                  className={cn(
                    item.direction === 'sent' ? 'justify-end' : '',
                    item.messageType === 'text' || item.messageType === 'file' ? 'rounded-full' : 'p-0 bg-transparent'
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
      </div>
      <div className="p-3">
        <form className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <PlusCircle size={20}/>
          </Button>
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <File size={20}/>
          </Button>
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <PaperclipIcon size={20}/>
          </Button>
          <div
            className="relative rounded-full w-full border bg-background focus-within:ring-1 focus-within:ring-ring h-auto">
            <ChatInput
              placeholder="Type your message here..."
              className="min-h-12 resize-none rounded-full bg-background border-0 p-3 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button size="icon" className="h-auto p-2 bg-blue-500">
            <CornerDownLeft size={20}/>
          </Button>
        </form>
      </div>
    </>
  )
}
