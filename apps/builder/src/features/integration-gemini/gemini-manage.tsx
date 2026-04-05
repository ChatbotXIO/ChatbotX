"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import { useWorkspaceId } from "@/hooks/routing"
import { updateGeminiAction } from "./actions/update.action"
import { GeminiConnectDialog } from "./gemini-connect-dialog"
import { GeminiDisconnectDialog } from "./gemini-disconnect-dialog"
import type { findIntegrationGemini } from "./queries"

type GeminiAIManageProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationGemini>>]>
}

export const GeminiAIManage = (props: GeminiAIManageProps) => {
  const { promises } = props
  const workspaceId = useWorkspaceId()

  const [integrationGemini] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute: onChangeGemini, isPending: onPendingGemini } = useAction(
    updateGeminiAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  return (
    <div className="flex flex-col space-y-4">
      <SettingRow
        description={t("gemini.connect.description")}
        label={t("gemini.connect.label")}
      >
        {integrationGemini?.auth ? (
          <GeminiDisconnectDialog />
        ) : (
          <GeminiConnectDialog />
        )}
      </SettingRow>

      {integrationGemini?.auth ? (
        <SettingRow
          description={t("gemini.autoReply.description")}
          label={t("gemini.autoReply.label")}
        >
          <div className="flex gap-2">
            <Switch
              checked={integrationGemini.autoReply}
              disabled={onPendingGemini}
              onCheckedChange={(autoReply) => {
                onChangeGemini({
                  autoReply,
                })
              }}
            />
            {onPendingGemini && <Loader2Icon className="size-4 animate-spin" />}
          </div>
        </SettingRow>
      ) : null}
    </div>
  )
}
