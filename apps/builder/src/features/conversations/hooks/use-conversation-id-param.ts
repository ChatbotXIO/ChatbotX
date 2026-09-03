"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * Reads and writes the `conversationId` query param that deep-links the
 * inbox to a conversation.
 *
 * Selecting a conversation and clearing the selection both need to keep this
 * param in sync — otherwise `initActiveConversationFromUrl` re-derives a
 * stale selection from the URL on the next mount of `ConversationList`,
 * which on the mobile single-pane layout happens every time the user goes
 * back to the list.
 */
export function useConversationIdParam() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const set = (conversationId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("conversationId", conversationId)
    router.replace(`?${params.toString()}`)
  }

  const clear = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (!params.has("conversationId")) {
      return
    }
    params.delete("conversationId")
    const queryString = params.toString()
    router.replace(queryString ? `?${queryString}` : pathname)
  }

  return { set, clear }
}
