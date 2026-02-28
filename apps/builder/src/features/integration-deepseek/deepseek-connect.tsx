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
import { disconnectDeepSeekAction } from "./actions/disconnect.action"
import ChangeAutoReply from "./components/change-auto-reply"
import { DeepSeekConnectDialog } from "./deepseek-connect-dialog"
import type { findIntegrationDeepSeek } from "./queries"

type DeepSeekConnectProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationDeepSeek>>]>
}

export const DeepSeekConnect = (props: DeepSeekConnectProps) => {
  const { chatbotId, promises } = props

  const [{ data: integrationDeepSeek }] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectDeepSeekAction.bind(null, chatbotId), {
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
    <>
      <SettingRow
        description={t("deepseek.connect.description")}
        label={t("messages.connectFeature", {
          feature: t("fields.deepseek.label"),
        })}
      >
        {integrationDeepSeek ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                {t("actions.disconnect")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("messages.disconnectFeature", {
                    feature: t("fields.deepseek.label"),
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("messages.disconnectFeatureDescription", {
                    feature: t("fields.deepseek.label"),
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
          <DeepSeekConnectDialog chatbotId={chatbotId} />
        )}
      </SettingRow>

      {integrationDeepSeek && (
        <div className="mt-4 flex flex-col gap-4">
          <SettingRow
            description={t("automatedResponse.setting.description")}
            label={t("automatedResponse.setting.label")}
          >
            <ChangeAutoReply integrationDeepSeek={integrationDeepSeek} />
          </SettingRow>
        </div>
      )}
    </>
  )
}
