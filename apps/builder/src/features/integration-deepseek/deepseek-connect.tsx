"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { AiIntegrationConnect } from "@/features/integration-ai/components/ai-integration-connect"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationDeepSeekAction } from "./actions/update.action"
import { DeepSeekConnectDialog } from "./deepseek-connect-dialog"
import { DeepSeekDisconnectDialog } from "./deepseek-disconnect-dialog"
import type { findIntegrationDeepSeek } from "./queries"

type DeepSeekAIManageProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationDeepSeek>>]>
}

export const DeepSeekConnect = ({ promises }: DeepSeekAIManageProps) => {
  const workspaceId = useWorkspaceId()
  const [integrationDeepseek] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute, isPending } = useAction(
    updateIntegrationDeepSeekAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  const isConnected = Boolean(integrationDeepseek?.auth)

  return (
    <AiIntegrationConnect
      actionSlot={
        isConnected ? <DeepSeekDisconnectDialog /> : <DeepSeekConnectDialog />
      }
      autoReply={integrationDeepseek?.autoReply ?? false}
      autoReplyDescription={t("deepseek.autoReply.description")}
      autoReplyLabel={t("deepseek.autoReply.label")}
      connectDescription={t("deepseek.connect.description")}
      connectLabel={t("deepseek.connect.label")}
      isConnected={isConnected}
      isToggling={isPending}
      onToggleAutoReply={(autoReply) => execute({ autoReply })}
    />
  )
}
