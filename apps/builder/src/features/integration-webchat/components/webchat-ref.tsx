import { createId } from "@chatbotx.io/utils"
import { useSearchParams } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { createWebchatMessageAction } from "@/features/messages/actions/create-webchat-message.action"
import { getWebchatProfileFields } from "../browser-profile-fields"
import { useGuestSessionStore } from "../providers/store/guest-session-provider"

type WebchatRefProps = {
  workspaceId: string
  webchatId: string
  guestConversationId: string
  accessToken?: string | null
}

export default function WebchatRef({
  workspaceId,
  webchatId,
  guestConversationId,
  accessToken,
}: WebchatRefProps) {
  const embeddingOrigin = useGuestSessionStore((state) => state.embeddingOrigin)
  const searchParams = useSearchParams()
  const [initialized, setInitialized] = useState(false)

  const { execute } = useAction(createWebchatMessageAction)

  useEffect(() => {
    if (initialized || !guestConversationId) {
      return
    }

    setInitialized(true)
    const ref = searchParams.get("ref")
    execute({
      clientId: createId(),
      workspaceId,
      webchatId,
      guestConversationId,
      ...(ref ? { initRef: ref } : { init: true }),
      ...getWebchatProfileFields(),
      accessToken: accessToken ?? undefined,
      parentOrigin: embeddingOrigin ?? undefined,
    })
  }, [
    searchParams,
    initialized,
    execute,
    workspaceId,
    webchatId,
    guestConversationId,
    embeddingOrigin,
    accessToken,
  ])

  return null
}
