"use client"

import { createId } from "@chatbotx.io/utils"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { createWebchatMessageAction } from "@/features/messages/actions/create-webchat-message.action"

type ShouldTriggerWelcomeFlowInput = {
  isNewGuestSession: boolean
  welcomeFlowId?: string | null
  guestConversationId?: string | null
  hasRef: boolean
}

type WebchatWelcomeFlowProps = ShouldTriggerWelcomeFlowInput & {
  workspaceId: string
  webchatId: string
  parentOrigin?: string | null
  accessToken?: string | null
}

export const shouldTriggerWelcomeFlow = ({
  isNewGuestSession,
  welcomeFlowId,
  guestConversationId,
  hasRef,
}: ShouldTriggerWelcomeFlowInput) =>
  isNewGuestSession && Boolean(welcomeFlowId && guestConversationId) && !hasRef

export function WebchatWelcomeFlow({
  workspaceId,
  webchatId,
  guestConversationId,
  welcomeFlowId,
  isNewGuestSession,
  hasRef,
  parentOrigin,
  accessToken,
}: WebchatWelcomeFlowProps) {
  const [initialized, setInitialized] = useState(false)
  const { execute } = useAction(createWebchatMessageAction)

  useEffect(() => {
    if (
      initialized ||
      !shouldTriggerWelcomeFlow({
        isNewGuestSession,
        welcomeFlowId,
        guestConversationId,
        hasRef,
      })
    ) {
      return
    }

    setInitialized(true)
    execute({
      clientId: createId(),
      workspaceId,
      webchatId,
      guestConversationId: guestConversationId ?? "",
      flowId: welcomeFlowId ?? "",
      accessToken: accessToken ?? undefined,
      parentOrigin: parentOrigin ?? undefined,
    })
  }, [
    execute,
    guestConversationId,
    hasRef,
    initialized,
    isNewGuestSession,
    parentOrigin,
    accessToken,
    webchatId,
    welcomeFlowId,
    workspaceId,
  ])

  return null
}
