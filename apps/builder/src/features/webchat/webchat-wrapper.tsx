"use client"

import { useEffect } from "react"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"
import { WebchatHeader } from "./webchat-header"
import { WebchatMessageInput } from "./webchat-message-input"
import { WebchatMessageList } from "./webchat-message-list"
import { WebchatRealtime } from "./webchat-realtime"

export const WebchatWrapper = () => {
  const { initGuestSession, guestConversationId, config } =
    useGuestSessionStore((state) => state)

  useEffect(() => {
    initGuestSession()
  }, [initGuestSession])

  return (
    <div className="flex h-screen w-screen flex-col">
      <WebchatHeader />
      <WebchatMessageList />
      <WebchatMessageInput chatbotId={config.chatbotId} webchatId={config.id} />
      {!!guestConversationId && (
        <WebchatRealtime guestConversationId={guestConversationId} />
      )}
    </div>
  )
}
