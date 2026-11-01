"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { AiIntegrationConnect } from "@/features/integration-ai/components/ai-integration-connect"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationMuseAction } from "./actions/update.action"
import { MuseConnectDialog } from "./muse-connect-dialog"
import { MuseDisconnectDialog } from "./muse-disconnect-dialog"
import type { findIntegrationMuse } from "./queries"

type MuseAIManageProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationMuse>>]>
}

export const MuseConnect = ({ promises }: MuseAIManageProps) => {
  const workspaceId = useWorkspaceId()
  const [integrationMuse] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute, isPending } = useAction(
    updateIntegrationMuseAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  const isConnected = Boolean(integrationMuse?.auth)

  return (
    <AiIntegrationConnect
      actionSlot={
        isConnected ? <MuseDisconnectDialog /> : <MuseConnectDialog />
      }
      autoReply={integrationMuse?.autoReply ?? false}
      autoReplyDescription={t("muse.autoReply.description")}
      autoReplyLabel={t("muse.autoReply.label")}
      connectDescription={t("muse.connect.description")}
      connectLabel={t("muse.connect.label")}
      isConnected={isConnected}
      isToggling={isPending}
      onToggleAutoReply={(autoReply) => execute({ autoReply })}
    />
  )
}
