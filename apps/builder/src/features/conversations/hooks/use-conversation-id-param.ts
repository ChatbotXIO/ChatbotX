"use client"

import { usePathname, useSearchParams } from "next/navigation"

/**
 * Reads and writes the `conversationId` query param that deep-links the
 * inbox to a conversation.
 *
 * Selecting a conversation and clearing the selection both need to keep this
 * param in sync — otherwise `initActiveConversationFromUrl` re-derives a
 * stale selection from the URL on the next mount of `ConversationList`,
 * which on the mobile single-pane layout happens every time the user goes
 * back to the list.
 *
 * Uses `window.history.replaceState` instead of `router.replace`: Next.js
 * patches `replaceState`/`pushState` so `usePathname`/`useSearchParams` stay
 * in sync with the browser URL, but — unlike `router.replace` — it never
 * triggers an App Router navigation. `router.replace` here re-ran the whole
 * `InboxContent` RSC tree (the server seed: conversations list, messages,
 * contact) on every conversation click for no reason, since `ChatStoreProvider`
 * keeps its store across the re-render and discards the new seed anyway.
 */
export function useConversationIdParam() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const set = (conversationId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("conversationId", conversationId)
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`)
  }

  const clear = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (!params.has("conversationId")) {
      return
    }
    params.delete("conversationId")
    const queryString = params.toString()
    window.history.replaceState(
      null,
      "",
      queryString ? `${pathname}?${queryString}` : pathname,
    )
  }

  return { set, clear }
}
