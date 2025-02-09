"use client"

import { SettingRow } from "@/components/setting-row"
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
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { use } from "react"
import { connectGoogleSheets } from "./actions/connect.action"
import { disconnectGoogleSheets } from "./actions/disconnect.action"
import type { getGoogleSheetsIntegration } from "./queries"

type GoogleSheetsConnectProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getGoogleSheetsIntegration>>]>
}

export function GoogleSheetsConnect({
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
      label={<T keyName="settings.integrations.GoogleSheets.Title" />}
      description={
        <T keyName="settings.integrations.GoogleSheets.Descriptions" />
      }
    >
      {integrationGoogleSheets ? (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm">
            <Link href="../google-sheets">
              <T keyName="settings.integrations.ManageBtn" />
            </Link>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
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
                  onClick={async (e) => {
                    e.preventDefault()
                    await onDisconnect()
                  }}
                  disabled={isPendingDisconnect}
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
          size="sm"
          variant="secondary"
          onClick={async (e) => {
            e.preventDefault()
            await onConnect({ referer: window.location.href })
          }}
          disabled={isPendingConnect}
        >
          {isPendingConnect && <Loader2Icon className="animate-spin" />}
          <T keyName="common.integrations.Connect" />
        </Button>
      )}
    </SettingRow>
  )
}
