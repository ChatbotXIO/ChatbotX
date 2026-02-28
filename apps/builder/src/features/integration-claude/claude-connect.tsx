"use client"

import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import { useWorkspaceId } from "@/hooks/routing"
import { updateIntegrationClaudeAction } from "./actions/update.action"
import { ClaudeConnectDialog } from "./claude-connect-dialog"
import { ClaudeDisconnectDialog } from "./claude-disconnect-dialog"
import type { findIntegrationClaude } from "./queries"

type ClaudeAIManageProps = {
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationClaude>>]>
}

export const ClaudeConnect = (props: ClaudeAIManageProps) => {
  const { promises } = props
  const workspaceId = useWorkspaceId()

  const [integrationClaude] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute: onChangeClaude, isPending: onPendingClaude } = useAction(
    updateIntegrationClaudeAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        router.refresh()
      },
    },
  )

  return (
    <div className="flex flex-col space-y-4">
      <SettingRow
        description={t("claude.connect.description")}
        label={t("claude.connect.label")}
      >
        {integrationClaude?.auth ? (
          <ClaudeDisconnectDialog />
        ) : (
          <ClaudeConnectDialog />
        )}
      </SettingRow>

      {integrationClaude?.auth ? (
        <SettingRow
          description={t("claude.autoReply.description")}
          label={t("claude.autoReply.label")}
        >
          <div className="flex gap-2">
            <Switch
              checked={integrationClaude.autoReply}
              disabled={onPendingClaude}
              onCheckedChange={(autoReply) => {
                onChangeClaude({ autoReply })
              }}
            />
            {onPendingClaude && <Loader2Icon className="size-4 animate-spin" />}
          </div>
        </SettingRow>
      ) : null}
    </div>
  )
}
