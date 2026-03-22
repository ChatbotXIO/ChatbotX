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
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { toast } from "sonner"
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
  const t = useTranslations()

  const { executeAsync: onConnect, isPending: isPendingConnect } = useAction(
    connectGoogleSheets.bind(null, chatbotId),
    {
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )
  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectGoogleSheets.bind(null, chatbotId), {
      onSuccess: () => {
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
            <Link href="../google-sheets">{t("actions.manage")}</Link>
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                {/* {isPendingDisconnect && (
                  <Loader2Icon className="animate-spin" />
                )} */}
                {t("actions.disconnect")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("messages.disconnectFeature", {
                    feature: t("fields.googleSheets.label"),
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("messages.disconnectFeatureDescription", {
                    feature: t("fields.googleSheets.label"),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
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
                  {t("actions.disconnect")}
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
          {t("actions.connect")}
        </Button>
      )}
    </SettingRow>
  )
}
