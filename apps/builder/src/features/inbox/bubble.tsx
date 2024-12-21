import * as React from "react";

import {ChatMessageList} from "@/components/ui/chat/chat-message-list";
import {ChatBubble, ChatBubbleAvatar, ChatBubbleMessage} from "@/components/ui/chat/chat-bubble";
import {ChatInput} from "@/components/ui/chat/chat-input";
import {Button} from "@/components/ui/button";
import { CornerDownLeft, Mic, Paperclip } from "lucide-react";

export default function InboxBubble() {
  return (
    <section className="h-full">
      <div className="h-full max-h-[calc(100%-106px)]">
        <ChatMessageList>
          <ChatBubble variant='sent'>
            <ChatBubbleAvatar fallback='US'/>
            <ChatBubbleMessage variant='sent'>
              Hello, how has your day been? I hope you are doing well.
            </ChatBubbleMessage>
          </ChatBubble>

          <ChatBubble variant='received'>
            <ChatBubbleAvatar fallback='AI'/>
            <ChatBubbleMessage variant='received'>
              Hi, I am doing well, thank you for asking. How can I help you today?
            </ChatBubbleMessage>
          </ChatBubble>

          <ChatBubble variant='received'>
            <ChatBubbleAvatar fallback='AI'/>
            <ChatBubbleMessage isLoading/>
          </ChatBubble>
        </ChatMessageList>
      </div>
      <div className="px-3">
        <form
          className="relative rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring"
        >
          <ChatInput
            placeholder="Type your message here..."
            className="min-h-12 resize-none rounded-lg bg-background border-0 p-3 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center p-3 pt-0">
            <Button variant="ghost" size="icon">
              <Paperclip className="size-4"/>
              <span className="sr-only">Attach file</span>
            </Button>

            <Button variant="ghost" size="icon">
              <Mic className="size-4"/>
              <span className="sr-only">Use Microphone</span>
            </Button>

            <Button
              size="sm"
              className="ml-auto gap-1.5"
            >
              Send Message
              <CornerDownLeft className="size-3.5"/>
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
