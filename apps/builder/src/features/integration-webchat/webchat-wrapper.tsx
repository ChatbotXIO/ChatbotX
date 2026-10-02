"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { RefreshCwIcon } from "lucide-react"
import type { CSSProperties } from "react"
import WebchatRef from "./components/webchat-ref"
import { readableForeground } from "./lib/brand-color"
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
  const { guestConversationId, accessToken, config, connectionStatus } =
    useGuestSessionStore((state) => state)

  const brandColorStyle = {
    "--primary": config.brandColor,
    "--primary-foreground": readableForeground(config.brandColor),
  } as CSSProperties

  return (
    <div className="flex h-screen w-screen flex-col" style={brandColorStyle}>
      {!config.hideHeader && <WebchatHeader />}
      {connectionStatus === "closed" && (
        <div className="flex items-center justify-between gap-2 border-b bg-destructive/10 px-3 py-2 text-destructive text-sm">
          <span>Connection lost. Reload to keep chatting.</span>
          <Button
            aria-label="Reload"
            onClick={() => window.location.reload()}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon className="size-4" />
            Reload
          </Button>
        </div>
      )}
      <WebchatMessageList />
      {!config.hideMessageInput && (
        <WebchatMessageInput
          accessToken={accessToken}
          parentOrigin={parentOrigin}
          referral={referral}
          webchatId={config.id}
          workspaceId={config.workspaceId}
        />
      )}
      <WebchatRef
        accessToken={accessToken}
        guestConversationId={guestConversationId ?? ""}
        parentOrigin={parentOrigin}
        webchatId={config.id}
        workspaceId={config.workspaceId}
      />
      {!!guestConversationId && (
        <WebchatRealtime guestConversationId={guestConversationId} />
      )}
    </div>
  )
}
