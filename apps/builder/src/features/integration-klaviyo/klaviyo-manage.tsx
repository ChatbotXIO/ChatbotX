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
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { toast } from "sonner"
import { SettingRow } from "@/components/setting-row"
import { disconnectKlaviyo } from "./actions/disconnect.action"
import { KlaviyoConnectDialog } from "./components/connect-dialog"
import type { getKlaviyoIntegration } from "./queries"

type KlaviyoManageProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getKlaviyoIntegration>>]>
}

export function KlaviyoManage({ chatbotId, promises }: KlaviyoManageProps) {
  const [integrationKlaviyo] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute: onDisconnect, isPending: isPendingDisconnect } = useAction(
    disconnectKlaviyo.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.disconnectedSuccess", {
            feature: t("klaviyo.title"),
          }),
        )
        router.refresh()
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  return (
    <SettingRow
      description={t("klaviyo.setting.description")}
      label={t("klaviyo.setting.label")}
    >
      {integrationKlaviyo ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  {t("actions.disconnect")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("dialog.disconnect.title", {
                      feature: t("klaviyo.title"),
                    })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("dialog.disconnect.description", {
                      feature: t("klaviyo.title"),
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isPendingDisconnect}
                    onClick={() => onDisconnect()}
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
        </div>
      ) : (
        <KlaviyoConnectDialog chatbotId={chatbotId}>
          <Button size="sm" variant="secondary">
            {t("actions.connect")}
          </Button>
        </KlaviyoConnectDialog>
      )}
    </SettingRow>
  )
}
