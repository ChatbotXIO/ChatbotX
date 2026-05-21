"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ChevronDownIcon } from "lucide-react"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

export const WebchatHeader = () => {
  const { config } = useGuestSessionStore((state) => state)

  // const refreshGuestSession = () => {
  //   localStorage.removeItem("x-conversation-id")
  //   window.location.reload()
  // }

  const hideWebchatIframe = () => {
    // "*" is intentional — widget is embedded in unknown customer domains
    window.parent.postMessage({ type: "ahc:hide" }, "*")
  }

  return (
    <div className="flex flex-end items-center border-b px-3 py-1">
      <h1 className="flex-1 font-bold">{config.name}</h1>
      {/* <Button onClick={refreshGuestSession} size="icon" variant="ghost">
        <RefreshCwIcon />
      </Button> */}
      <Button onClick={hideWebchatIframe} size="icon" variant="ghost">
        <ChevronDownIcon />
      </Button>
    </div>
  )
}
