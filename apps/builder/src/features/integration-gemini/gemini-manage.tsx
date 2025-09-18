"use client"

import { Switch } from "@aha.chat/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import { updateGeminiAction } from "./actions/update.action"
import { GeminiConnectDialog } from "./gemini-connect-dialog"
import { GeminiDisconnectDialog } from "./gemini-disconnect-dialog"
import type { findIntegrationGemini } from "./queries"

type GeminiAIManageProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationGemini>>]>
}

export const GeminiAIManage = (props: GeminiAIManageProps) => {
  const { promises } = props
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const [integrationGemini] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute: onChangeGemini, isPending: onPendingGemini } = useAction(
    updateGeminiAction.bind(null, chatbotId),
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

      {integrationGemini?.auth && (
        <SettingRow
          description={t("gemini.aiAutoReply.description")}
          label={t("gemini.aiAutoReply.label")}
        >
          <div className="flex gap-2">
            <Switch
              checked={integrationGemini.aiAutoReply}
              disabled={onPendingGemini}
              onCheckedChange={(aiAutoReply) => {
                onChangeGemini({
                  aiAutoReply,
                })
              }}
            />
            {onPendingGemini && <Loader2Icon className="size-4 animate-spin" />}
          </div>
        </SettingRow>
      )}
    </div>
  )
}
