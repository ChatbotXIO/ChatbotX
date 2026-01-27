import { createId } from "@paralleldrive/cuid2"
import { useSearchParams } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { createWebchatMessageAction } from "@/features/messages/actions/create-webchat-message.action"

type WebchatRefProps = {
  chatbotId: string
  webchatId: string
  guestConversationId: string
}

export default function WebchatRef({
  chatbotId,
  webchatId,
  guestConversationId,
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
    if (ref) {
      execute({
        clientId: createId(),
        chatbotId,
        webchatId,
        guestConversationId,
        initRef: ref,
      })
    }
  }, [
    searchParams,
    initialized,
    execute,
    chatbotId,
    webchatId,
    guestConversationId,
  ])

  return null
}
