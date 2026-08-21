"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { connectFacebookAds } from "./actions/connect.action"
import { disconnectFacebookAdsAction } from "./actions/disconnect.action"
import { needsFacebookAdsReconnect } from "./lib/needs-reconnect"
import type { IntegrationFacebookAdsResource } from "./schemas"

type FacebookAdsManageProps = {
  workspaceId: string
  integrationFacebookAds: IntegrationFacebookAdsResource | undefined
}

export function FacebookAdsManage({
  workspaceId,
  integrationFacebookAds,
}: FacebookAdsManageProps) {
  const router = useRouter()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const t = useTranslations()

  const { executeAsync: onConnect, isPending: isPendingConnect } = useAction(
    connectFacebookAds.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectFacebookAdsAction.bind(null, workspaceId), {
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
    <SettingRow
      description={t("facebookAds.setting.description")}
      label={t("facebookAds.setting.label")}
    >
      {integrationFacebookAds ? (
        <div className="flex flex-col gap-2">
          {needsFacebookAdsReconnect(integrationFacebookAds) && (
            <Button
              disabled={isPendingConnect}
              onClick={async (e) => {
                e.preventDefault()
                await onConnect()
              }}
              size="sm"
              variant="secondary"
            >
              {isPendingConnect && <Loader2Icon className="animate-spin" />}
              {t("facebookAds.setting.reconnect")}
            </Button>
          )}

          <DisconnectIntegrationDialog
            featureLabel={t("facebookAds.title")}
            isPending={isPendingDisconnect}
            onConfirm={onDisconnect}
            onOpenChange={setDisconnectOpen}
            open={disconnectOpen}
          />
        </div>
      ) : (
        <Button
          disabled={isPendingConnect}
          onClick={async (e) => {
            e.preventDefault()
            await onConnect()
          }}
          size="sm"
          variant="secondary"
        >
          {isPendingConnect && <Loader2Icon className="animate-spin" />}
          {t("actions.connect")}
        </Button>
      )}
    </SettingRow>
  )
}
