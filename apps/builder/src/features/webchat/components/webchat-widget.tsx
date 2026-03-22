"use client"

import type { IntegrationWebchatModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Card } from "@aha.chat/ui/components/ui/card"
import { Input } from "@aha.chat/ui/components/ui/input"
import { MessageCircleIcon, SendIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"
import {
  GuestSessionStoreProvider,
  useGuestSessionStore,
} from "../providers/store/guest-session-provider"
import { WebchatMessageList } from "../webchat-message-list"
import { WebchatRealtime } from "../webchat-realtime"

type WebchatWidgetProps = {
  config: IntegrationWebchatModel
  chatbotId: string
  webchatId: string
  baseUrl: string
}

const WebchatWidgetContent = () => {
  const { initGuestSession, guestConversationId, config } =
    useGuestSessionStore((state) => state)
  const [message, setMessage] = useState("")
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    initGuestSession()
  }, [initGuestSession])

  const handleSendMessage = () => {
    if (!message.trim()) {
      return
    }

    // TODO: Implement sendMessage functionality
    console.log("Sending message:", message.trim())
    setMessage("")
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  if (!isOpen) {
    return (
      <div className="fixed right-4 bottom-4 z-50">
        <Button
          className="h-14 w-14 rounded-full shadow-lg"
          onClick={() => setIsOpen(true)}
          style={{ backgroundColor: config.brandColor }}
        >
          <MessageCircleIcon className="h-6 w-6 text-white" />
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 h-[600px] w-[400px]">
      <Card className="flex h-full flex-col border shadow-lg">
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ backgroundColor: config.brandColor }}
        >
          <div className="flex items-center gap-2">
            {config.showLogo && (
              <div className="h-8 w-8 rounded-full bg-white/20" />
            )}
            <h3 className="font-semibold text-white">{config.name}</h3>
          </div>
          <Button
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={() => setIsOpen(false)}
            size="icon"
            variant="ghost"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <WebchatMessageList />
          {guestConversationId && (
            <WebchatRealtime guestConversationId={guestConversationId} />
          )}
        </div>

        {/* Input */}
        {config.hideMessageInput && (
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                className="flex-1"
                disabled={false}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                value={message}
              />
              <Button
                disabled={!message.trim()}
                onClick={handleSendMessage}
                size="icon"
                style={{ backgroundColor: config.brandColor }}
              >
                <SendIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export const WebchatWidget = ({ config }: WebchatWidgetProps) => (
  <GuestSessionStoreProvider config={config}>
    <WebchatWidgetContent />
  </GuestSessionStoreProvider>
)
