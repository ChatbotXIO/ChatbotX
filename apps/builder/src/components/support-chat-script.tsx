"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"

const WEBCHAT_PATH = "/webchat"
// The bot simulator embeds the customer's own webchat bubble in the same
// corner, so the support bubble would sit on top of it.
const BOT_SIMULATOR_PATH_PREFIX = "/bs/"
// The web shop is the merchant's own page for their customers; the platform's
// support bubble does not belong there.
const WEBSHOP_PATH_PREFIX = "/shop/"
// The inbox composer and conversation panel sit in the corner the support
// bubble covers.
const INBOX_PATH_PATTERN = /^\/space\/[^/]+\/inbox(\/|$)/
// Root element the Pancake plugin mounts its bubble into.
const PANCAKE_ROOT_SELECTOR = "#pancake-chat-plugin-root"

interface SupportChatScriptProps {
  pageId: string
}

function isSupportChatHidden(pathname: string) {
  return (
    pathname === WEBCHAT_PATH ||
    pathname.startsWith(BOT_SIMULATOR_PATH_PREFIX) ||
    pathname.startsWith(WEBSHOP_PATH_PREFIX)
  )
}

// The script keeps its bubble mounted across client-side navigation, so the
// inbox hides it with CSS instead of skipping the script.
function isSupportChatBubbleHidden(pathname: string) {
  return INBOX_PATH_PATTERN.test(pathname)
}

export function SupportChatScript({ pageId }: SupportChatScriptProps) {
  const pathname = usePathname()

  if (isSupportChatHidden(pathname)) {
    return null
  }

  return (
    <>
      <Script
        src={`https://chat-plugin.pancake.vn/main/auto?page_id=${encodeURIComponent(pageId)}&hide_supplier=true`}
      />
      {isSupportChatBubbleHidden(pathname) && (
        <style>{`${PANCAKE_ROOT_SELECTOR}{display:none !important}`}</style>
      )}
    </>
  )
}
