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
import { connectMailchimp } from "../actions/connect.action"
import { disconnectMailchimp } from "../actions/disconnect.action"
import type { getMailchimpIntegration } from "../queries"

type MailchimpManageProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getMailchimpIntegration>>]>
}

export function MailchimpManage({ chatbotId, promises }: MailchimpManageProps) {
  const [integrationMailchimp] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { executeAsync: onConnect, isPending: isPendingConnect } = useAction(
    connectMailchimp.bind(null, chatbotId),
    {
      onError: ({ error }) => {
        const message = error.serverError || t("errors.something_went_wrong")
        toast.error(message)
      },
    },
  )

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectMailchimp.bind(null, chatbotId), {
      onSuccess: () => {
        toast.success(t("mailchimp.disconnected"))
        router.refresh()
      },
      onError: ({ error }) => {
        const message = error.serverError || t("errors.something_went_wrong")
        toast.error(message)
      },
    })

  const featureName = "Mailchimp"

  return (
    <SettingRow
      description={t("mailchimp.setting.description")}
      label={t("mailchimp.setting.label")}
    >
      <div className="flex items-center gap-2">
        {integrationMailchimp ? (
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
                    feature: featureName,
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("dialog.disconnect.description", {
                    feature: featureName,
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
      </div>
    </SettingRow>
  )
}
