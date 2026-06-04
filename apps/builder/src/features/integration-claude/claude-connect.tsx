"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { AiIntegrationConnect } from "@/features/integration-ai/components/ai-integration-connect"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationClaudeAction } from "./actions/update.action"
import { ClaudeConnectDialog } from "./claude-connect-dialog"
import { ClaudeDisconnectDialog } from "./claude-disconnect-dialog"
import type { findIntegrationClaude } from "./queries"

type ClaudeAIManageProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationClaude>>]>
}

export const ClaudeConnect = ({ promises }: ClaudeAIManageProps) => {
  const workspaceId = useWorkspaceId()
  const [integrationClaude] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute, isPending } = useAction(
    updateIntegrationClaudeAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  const isConnected = Boolean(integrationClaude?.auth)

  return (
    <AiIntegrationConnect
      actionSlot={
        isConnected ? <ClaudeDisconnectDialog /> : <ClaudeConnectDialog />
      }
      autoReply={integrationClaude?.autoReply ?? false}
      autoReplyDescription={t("claude.autoReply.description")}
      autoReplyLabel={t("claude.autoReply.label")}
      connectDescription={t("claude.connect.description")}
      connectLabel={t("claude.connect.label")}
      isConnected={isConnected}
      isToggling={isPending}
      onToggleAutoReply={(autoReply) => execute({ autoReply })}
    />
  )
}
