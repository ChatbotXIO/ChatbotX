"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"

const WEBCHAT_PATH = "/webchat"
// The bot simulator embeds the customer's own webchat bubble in the same
// corner, so the support bubble would sit on top of it.
const BOT_SIMULATOR_PATH_PREFIX = "/bs/"

interface SupportChatScriptProps {
  pageId: string
}

function isSupportChatHidden(pathname: string) {
  return (
    pathname === WEBCHAT_PATH || pathname.startsWith(BOT_SIMULATOR_PATH_PREFIX)
  )
}

export function SupportChatScript({ pageId }: SupportChatScriptProps) {
  const pathname = usePathname()

  if (isSupportChatHidden(pathname)) {
    return null
  }

  return (
    <Script
      src={`https://chat-plugin.pancake.vn/main/auto?page_id=${encodeURIComponent(pageId)}&hide_supplier=true`}
    />
  )
}
