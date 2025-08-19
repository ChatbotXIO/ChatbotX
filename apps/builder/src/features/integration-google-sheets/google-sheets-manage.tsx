"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@aha.chat/ui/components/ui/alert-dialog"
import { Button } from "@aha.chat/ui/components/ui/button"
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import { connectGoogleSheets } from "./actions/connect.action"
import { disconnectGoogleSheets } from "./actions/disconnect.action"
import type { getGoogleSheetsIntegration } from "./queries"

type GoogleSheetsConnectProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getGoogleSheetsIntegration>>]>
}

export function GoogleSheetsManage({
  chatbotId,
  promises,
}: GoogleSheetsConnectProps) {
  const [{ data: integrationGoogleSheets }] = use(promises)
  const router = useRouter()
  const { t } = useTranslate()

  const { executeAsync: onConnect, isPending: isPendingConnect } = useAction(
    connectGoogleSheets.bind(null, chatbotId),
  )
  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectGoogleSheets.bind(null, chatbotId), {
      onSuccess: () => {
        router.refresh()
      },
    })

  return (
    <SettingRow
      description={t("settings.integrations.GoogleSheets.Descriptions")}
      label={t("settings.integrations.GoogleSheets.Title")}
    >
      {integrationGoogleSheets ? (
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="secondary">
            <Link href="../google-sheets">
              <T keyName="settings.integrations.ManageBtn" />
            </Link>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                {/* {isPendingDisconnect && (
                  <Loader2Icon className="animate-spin" />
                )} */}
                <T keyName="settings.integrations.DisconnectBtn" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("Integration.Disconnect.Confirm")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("Integration.Disconnect.Description")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("Integration.CancelBtn")}
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isPendingDisconnect}
                  onClick={async (e) => {
                    e.preventDefault()
                    await onDisconnect()
                  }}
                >
                  {isPendingDisconnect && (
                    <Loader2Icon className="animate-spin" />
                  )}
                  <T keyName="settings.integrations.DisconnectBtn" />
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
          <T keyName="common.integrations.Connect" />
        </Button>
      )}
    </SettingRow>
  )
}
