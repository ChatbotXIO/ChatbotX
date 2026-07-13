"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { DisconnectIntegrationDialog } from "@/features/common/components/disconnect-integration-dialog"
import { connectGoogleSheets } from "./actions/connect.action"
import { disconnectGoogleSheetsAction } from "./actions/disconnect.action"
import type { IntegrationGoogleSheetsResource } from "./schemas"

type GoogleSheetsConnectProps = {
  workspaceId: string
  integrationGoogleSheets: IntegrationGoogleSheetsResource | undefined
}

export function GoogleSheetsManage({
  workspaceId,
  integrationGoogleSheets,
}: GoogleSheetsConnectProps) {
  const router = useRouter()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const t = useTranslations()

  const { executeAsync: onConnect, isPending: isPendingConnect } = useAction(
    connectGoogleSheets.bind(null, workspaceId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectGoogleSheetsAction.bind(null, workspaceId), {
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
      description={t("googleSheets.setting.description")}
      label={t("googleSheets.setting.label")}
    >
      {integrationGoogleSheets ? (
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary">
            <Link className="w-full" href="../google-sheets">
              {t("actions.manage")}
            </Link>
          </Button>

          <DisconnectIntegrationDialog
            featureLabel={t("fields.googleSheets.label")}
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
            await onConnect({ referer: window.location.href })
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
