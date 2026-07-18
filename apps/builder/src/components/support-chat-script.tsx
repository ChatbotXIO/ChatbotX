"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"

const WEBCHAT_PATH = "/webchat"

interface SupportChatScriptProps {
  pageId: string
}

export function SupportChatScript({ pageId }: SupportChatScriptProps) {
  const pathname = usePathname()

  if (pathname === WEBCHAT_PATH) {
    return null
  }

  return (
    <Script
      src={`https://chat-plugin.pancake.vn/main/auto?page_id=${encodeURIComponent(pageId)}&hide_supplier=true`}
    />
  )
}
