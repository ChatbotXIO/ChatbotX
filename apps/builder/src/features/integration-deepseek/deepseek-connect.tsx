"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationDeepSeekAction } from "./actions/update.action"
import { DeepSeekConnectDialog } from "./deepseek-connect-dialog"
import { DeepSeekDisconnectDialog } from "./deepseek-disconnect-dialog"
import type { findIntegrationDeepSeek } from "./queries"

type DeepSeekAIManageProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationDeepSeek>>]>
}

export const DeepSeekConnect = (props: DeepSeekAIManageProps) => {
  const { promises } = props
  const workspaceId = useWorkspaceId()

  const [integrationDeepseek] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute: onChangeDeepSeek, isPending: onPendingDeepSeek } = useAction(
    updateIntegrationDeepSeekAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  return (
    <div className="flex flex-col space-y-4">
      <SettingRow
        description={t("deepseek.connect.description")}
        label={t("deepseek.connect.label")}
      >
        {integrationDeepseek?.auth ? (
          <DeepSeekDisconnectDialog />
        ) : (
          <DeepSeekConnectDialog />
        )}
      </SettingRow>

      {integrationDeepseek?.auth ? (
        <SettingRow
          description={t("deepseek.autoReply.description")}
          label={t("deepseek.autoReply.label")}
        >
          <div className="flex gap-2">
            <Switch
              checked={integrationDeepseek.autoReply}
              disabled={onPendingDeepSeek}
              onCheckedChange={(autoReply) => {
                onChangeDeepSeek({ autoReply })
              }}
            />
            {onPendingDeepSeek && (
              <Loader2Icon className="size-4 animate-spin" />
            )}
          </div>
        </SettingRow>
      ) : null}
    </div>
  )
}
