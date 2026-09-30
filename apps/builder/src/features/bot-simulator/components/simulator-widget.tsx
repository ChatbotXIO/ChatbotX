"use client"

import Script from "next/script"

type CsmChatWidget = {
  init: (config: {
    webchatId: string
    workspaceId: string
    brandColor: string
    parentUrl: string
  }) => void
}

type SimulatorWidgetProps = {
  webchatId: string
  workspaceId: string
  brandColor: string
  websiteUrl: string
}

/**
 * Loads the same `plugin.js` a customer pastes on their site, so the simulator
 * shows exactly what the real embed would. `parentUrl` is the simulated site,
 * not this page, so the conversation records the website being demoed.
 */
export function SimulatorWidget({
  webchatId,
  workspaceId,
  brandColor,
  websiteUrl,
}: SimulatorWidgetProps) {
  const handleLoad = () => {
    const widget = (window as Window & { csmChatWidget?: CsmChatWidget })
      .csmChatWidget
    widget?.init({ webchatId, workspaceId, brandColor, parentUrl: websiteUrl })
  }

  return (
    <Script
      crossOrigin="anonymous"
      onLoad={handleLoad}
      src="/chat-widget/plugin.js"
      strategy="afterInteractive"
      type="module"
    />
  )
}
