"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import { ChevronDownIcon, RefreshCwIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

export const WebchatHeader = () => {
  const { config } = useGuestSessionStore((state) => state)

  const [isWebchatWidget, setIsWebchatWidget] = useState(false)

  useEffect(() => {
    setIsWebchatWidget(Boolean(window.parent))
  }, [])

  const refreshGuestSession = () => {
    if (!isWebchatWidget) {
      localStorage.removeItem("x-conversation-id")
      window.location.reload()
    }
  }

  const onCloseWebchatWidget = () => {
    if (isWebchatWidget) {
      window.parent.postMessage(
        {
          type: "ahc.close",
        },
        "*",
      )
    }
  }

  return (
    <div className="flex flex-end items-center border-b px-3 py-1">
      <h1 className="flex-1 font-bold">{config.name}</h1>
      {!isWebchatWidget && (
        <Button onClick={refreshGuestSession} size="icon" variant="ghost">
          <RefreshCwIcon />
        </Button>
      )}
      {isWebchatWidget && (
        <Button onClick={onCloseWebchatWidget} size="icon" variant="ghost">
          <ChevronDownIcon />
        </Button>
      )}
    </div>
  )
}
