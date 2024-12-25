'use client'

import { ChatMessageList } from "@/components/ui/chat/chat-message-list";
import { ChatBubble, ChatBubbleAvatar, ChatBubbleMessage } from "@/components/ui/chat/chat-bubble";
import { ChatInput } from "@/components/ui/chat/chat-input";
import { Button } from "@/components/ui/button";
import { CornerDownLeft, PlusCircle, File, PaperclipIcon } from "lucide-react";
import { Message } from "./interfaces/message";

interface MessagesProps {
  messages: Message[]
}

export default function Messages({ messages }: MessagesProps) {
  return (
    <section className="h-full">
      <div className="h-full max-h-[calc(100%-70px)]">
        <ChatMessageList>
          {
            messages.map((message) => (
              <ChatBubble variant={message.direction} key={message.id}>
                <ChatBubbleAvatar fallback='US'/>
                <ChatBubbleMessage variant={message.direction}>
                  { message.content }
                </ChatBubbleMessage>
              </ChatBubble>
            ))
          }
          {/*<ChatBubble variant='sent'>*/}
          {/*  <ChatBubbleAvatar fallback='US'/>*/}
          {/*  <ChatBubbleMessage variant='sent'>*/}
          {/*    Hello, how has your day been? I hope you are doing well.*/}
          {/*  </ChatBubbleMessage>*/}
          {/*</ChatBubble>*/}

          {/*<ChatBubble variant='received'>*/}
          {/*  <ChatBubbleAvatar fallback='AI'/>*/}
          {/*  <ChatBubbleMessage variant='received'>*/}
          {/*    Hi, I am doing well, thank you for asking. How can I help you today?*/}
          {/*  </ChatBubbleMessage>*/}
          {/*</ChatBubble>*/}

          {/*<ChatBubble variant='received'>*/}
          {/*  <ChatBubbleAvatar fallback='AI'/>*/}
          {/*  <ChatBubbleMessage isLoading/>*/}
          {/*</ChatBubble>*/}
        </ChatMessageList>
      </div>
      <div className="p-3">
        <form className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <PlusCircle size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <File size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <PaperclipIcon size={20} />
          </Button>
          <div className="relative rounded-full w-full border bg-background focus-within:ring-1 focus-within:ring-ring h-auto">
            <ChatInput
              placeholder="Type your message here..."
              className="min-h-12 resize-none rounded-full bg-background border-0 p-3 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button size="icon" className="h-auto p-2">
            <CornerDownLeft size={20} />
          </Button>
        </form>
      </div>
    </section>
  )
}
