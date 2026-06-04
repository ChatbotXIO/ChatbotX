"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { AiIntegrationConnect } from "@/features/integration-ai/components/ai-integration-connect"
import { useWorkspaceId } from "@/hooks/routing"
import { updateGeminiAction } from "./actions/update.action"
import { GeminiConnectDialog } from "./gemini-connect-dialog"
import { GeminiDisconnectDialog } from "./gemini-disconnect-dialog"
import type { findIntegrationGemini } from "./queries"

type GeminiAIManageProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationGemini>>]>
}

export const GeminiAIManage = ({ promises }: GeminiAIManageProps) => {
  const workspaceId = useWorkspaceId()
  const [integrationGemini] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute, isPending } = useAction(
    updateGeminiAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  const isConnected = Boolean(integrationGemini?.auth)

  return (
    <AiIntegrationConnect
      actionSlot={
        isConnected ? <GeminiDisconnectDialog /> : <GeminiConnectDialog />
      }
      autoReply={integrationGemini?.autoReply ?? false}
      autoReplyDescription={t("gemini.autoReply.description")}
      autoReplyLabel={t("gemini.autoReply.label")}
      connectDescription={t("gemini.connect.description")}
      connectLabel={t("gemini.connect.label")}
      isConnected={isConnected}
      isToggling={isPending}
      onToggleAutoReply={(autoReply) => execute({ autoReply })}
    />
  )
}
