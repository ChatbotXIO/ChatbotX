"use client"

import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useState } from "react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { disconnectOpenAIAction } from "./actions/disconnect.action"
import ChangeAutoReply from "./components/change-auto-reply"
import { OpenAIConnectDialog } from "./openai-connect-dialog"
import type { findIntegrationOpenAI } from "./queries"

type OpenAIConnectProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationOpenAI>>]>
}

export const OpenAIConnect = (props: OpenAIConnectProps) => {
  const { workspaceId, promises } = props

  const [{ data: integrationOpenAI }] = use(promises)
  const router = useRouter()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const t = useTranslations()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectOpenAIAction.bind(null, workspaceId), {
      onSuccess: () => {
        setDisconnectOpen(false)
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    })

  return (
    <>
      <SettingRow
        description={t("openai.connect.description")}
        label={t("actions.connectFeature", {
          feature: t("fields.openai.label"),
        })}
      >
        {integrationOpenAI ? (
          <DisconnectIntegrationDialog
            featureLabel={t("fields.openai.label")}
            isPending={isPendingDisconnect}
            onConfirm={onDisconnect}
            onOpenChange={setDisconnectOpen}
            open={disconnectOpen}
          />
        ) : (
          <OpenAIConnectDialog workspaceId={workspaceId} />
        )}
      </SettingRow>

      {integrationOpenAI && (
        <div className="mt-4 flex flex-col gap-4">
          <SettingRow
            description={t("automatedResponse.setting.description")}
            label={t("automatedResponse.setting.label")}
          >
            <ChangeAutoReply integrationOpenAI={integrationOpenAI} />
          </SettingRow>
        </div>
      )}
    </>
  )
}
