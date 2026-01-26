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
import { disconnectMoosend } from "./actions/disconnect.action"
import { MoosendConnectDialog } from "./components/connect-dialog"
import type { getMoosendIntegration } from "./queries"

type MoosendManageProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getMoosendIntegration>>]>
}

export function MoosendManage({ chatbotId, promises }: MoosendManageProps) {
  const [integrationMoosend] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { executeAsync: executeDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectMoosend.bind(null, chatbotId))

  const onDisconnect = async () => {
    const result = await executeDisconnect()

    if (result?.data?.success) {
      toast.success(
        t("messages.disconnectedSuccess", {
          feature: t("moosend.title"),
        }),
      )
      router.refresh()
    } else if (result?.serverError) {
      toast.error(result.serverError)
    }
  }

  return (
    <SettingRow
      description={t("moosend.setting.description")}
      label={t("moosend.setting.label")}
    >
      {integrationMoosend ? (
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
                      feature: t("moosend.title"),
                    })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("dialog.disconnect.description", {
                      feature: t("moosend.title"),
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
        <MoosendConnectDialog chatbotId={chatbotId}>
          <Button size="sm" variant="secondary">
            {t("actions.connect")}
          </Button>
        </MoosendConnectDialog>
      )}
    </SettingRow>
  )
}
