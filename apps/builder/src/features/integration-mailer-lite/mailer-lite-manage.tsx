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
import { disconnectMailerLite } from "./actions/disconnect.action"
import { MailerLiteConnectDialog } from "./components/connect-dialog"
import type { getMailerLiteIntegration } from "./queries"

type MailerLiteManageProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getMailerLiteIntegration>>]>
}

export function MailerLiteManage({
  chatbotId,
  promises,
}: MailerLiteManageProps) {
  const [integrationMailerLite] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute: onDisconnect, isPending: isPendingDisconnect } = useAction(
    disconnectMailerLite.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.disconnectedSuccess", {
            feature: t("mailerlite.title"),
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
      description={t("mailerlite.setting.description")}
      label={t("mailerlite.setting.label")}
    >
      {integrationMailerLite ? (
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
                      feature: t("mailerlite.title"),
                    })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("dialog.disconnect.description", {
                      feature: t("mailerlite.title"),
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
        <MailerLiteConnectDialog chatbotId={chatbotId}>
          <Button size="sm" variant="secondary">
            {t("actions.connect")}
          </Button>
        </MailerLiteConnectDialog>
      )}
    </SettingRow>
  )
}
