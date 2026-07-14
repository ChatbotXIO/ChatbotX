"use client"

import { useEffect } from "react"
import WebchatRef from "./components/webchat-ref"
import { WebchatWelcomeFlow } from "./components/webchat-welcome-flow"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"
import { WebchatHeader } from "./webchat-header"
import { WebchatMessageInput } from "./webchat-message-input"
import { WebchatMessageList } from "./webchat-message-list"
import { WebchatRealtime } from "./webchat-realtime"

export const WebchatWrapper = ({
  referral,
  parentOrigin,
}: {
  referral?: string
  parentOrigin?: string | null
}) => {
  const {
    initGuestSession,
    guestConversationId,
    isNewGuestSession,
    accessToken,
    config,
  } = useGuestSessionStore((state) => state)

  useEffect(() => {
    initGuestSession()
  }, [initGuestSession])

  return (
    <div className="flex h-screen w-screen flex-col">
      <WebchatHeader />
      <WebchatMessageList />
      <WebchatMessageInput
        accessToken={accessToken}
        parentOrigin={parentOrigin}
        referral={referral}
        webchatId={config.id}
        workspaceId={config.workspaceId}
      />
      <WebchatRef
        accessToken={accessToken}
        guestConversationId={guestConversationId ?? ""}
        parentOrigin={parentOrigin}
        webchatId={config.id}
        workspaceId={config.workspaceId}
      />
      <WebchatWelcomeFlow
        accessToken={accessToken}
        guestConversationId={guestConversationId}
        hasRef={Boolean(referral)}
        isNewGuestSession={isNewGuestSession}
        parentOrigin={parentOrigin}
        webchatId={config.id}
        welcomeFlowId={config.welcomeFlowId}
        workspaceId={config.workspaceId}
      />
      {!!guestConversationId && (
        <WebchatRealtime guestConversationId={guestConversationId} />
      )}
    </div>
  )
}
