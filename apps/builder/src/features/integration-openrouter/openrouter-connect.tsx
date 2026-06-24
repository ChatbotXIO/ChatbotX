"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { AiIntegrationConnect } from "@/features/integration-ai/components/ai-integration-connect"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationOpenRouterAction } from "./actions/update.action"
import { OpenRouterConnectDialog } from "./openrouter-connect-dialog"
import { OpenRouterDisconnectDialog } from "./openrouter-disconnect-dialog"
import type { findIntegrationOpenRouter } from "./queries"

type OpenRouterConnectProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationOpenRouter>>]>
}

export const OpenRouterConnect = ({ promises }: OpenRouterConnectProps) => {
  const workspaceId = useWorkspaceId()
  const [integrationOpenrouter] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute, isPending } = useAction(
    updateIntegrationOpenRouterAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  const isConnected = Boolean(integrationOpenrouter?.auth)

  return (
    <AiIntegrationConnect
      actionSlot={
        isConnected ? (
          <OpenRouterDisconnectDialog />
        ) : (
          <OpenRouterConnectDialog />
        )
      }
      autoReply={integrationOpenrouter?.autoReply ?? false}
      autoReplyDescription={t("openrouter.autoReply.description")}
      autoReplyLabel={t("openrouter.autoReply.label")}
      connectDescription={t("openrouter.connect.description")}
      connectLabel={t("openrouter.connect.label")}
      isConnected={isConnected}
      isToggling={isPending}
      onToggleAutoReply={(autoReply) => execute({ autoReply })}
    />
  )
}
