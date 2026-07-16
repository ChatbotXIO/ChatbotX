import { createId } from "@chatbotx.io/utils"
import { useSearchParams } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { createWebchatMessageAction } from "@/features/messages/actions/create-webchat-message.action"
import { getWebchatProfileFields } from "../browser-profile-fields"

type WebchatRefProps = {
  workspaceId: string
  webchatId: string
  guestConversationId: string
  parentOrigin?: string | null
  accessToken?: string | null
}

export default function WebchatRef({
  workspaceId,
  webchatId,
  guestConversationId,
  parentOrigin,
  accessToken,
}: WebchatRefProps) {
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
      parentOrigin: parentOrigin ?? undefined,
    })
  }, [
    searchParams,
    initialized,
    execute,
    workspaceId,
    webchatId,
    guestConversationId,
    parentOrigin,
    accessToken,
  ])

  return null
}
