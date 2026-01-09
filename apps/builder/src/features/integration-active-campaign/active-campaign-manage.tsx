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
import { disconnectActiveCampaign } from "./actions/disconnect.action"
import { ActiveCampaignConnectDialog } from "./components/connect-dialog"
import type { getActiveCampaignIntegration } from "./queries"

type ActiveCampaignManageProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getActiveCampaignIntegration>>]>
}

export function ActiveCampaignManage({
  chatbotId,
  promises,
}: ActiveCampaignManageProps) {
  const [integrationActiveCampaign] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { execute: onDisconnect, isPending: isPendingDisconnect } = useAction(
    disconnectActiveCampaign.bind(null, chatbotId),
    {
      onSuccess: () => {
        toast.success(
          t("messages.disconnectedSuccess", {
            feature: t("activeCampaign.title"),
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
      description={t("activeCampaign.setting.description")}
      label={t("activeCampaign.setting.label")}
    >
      {integrationActiveCampaign ? (
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
                      feature: t("activeCampaign.title"),
                    })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("dialog.disconnect.description", {
                      feature: t("activeCampaign.title"),
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isPendingDisconnect}
                    onClick={(e) => {
                      e.preventDefault()
                      onDisconnect()
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
        </div>
      ) : (
        <ActiveCampaignConnectDialog chatbotId={chatbotId}>
          <Button size="sm" variant="secondary">
            {t("actions.connect")}
          </Button>
        </ActiveCampaignConnectDialog>
      )}
    </SettingRow>
  )
}
