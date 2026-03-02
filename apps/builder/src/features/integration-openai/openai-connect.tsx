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
import { disconnectOpenAIAction } from "./actions/disconnect.action"
import ChangeAutoReply from "./components/change-auto-reply"
import { OpenAIConnectDialog } from "./openai-connect-dialog"
import type { findIntegrationOpenAI } from "./queries"

type OpenAIConnectProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationOpenAI>>]>
}

export const OpenAIConnect = (props: OpenAIConnectProps) => {
  const { chatbotId, promises } = props

  const [{ data: integrationOpenAI }] = use(promises)
  const router = useRouter()
  const t = useTranslations()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectOpenAIAction.bind(null, chatbotId), {
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
        description={t("openai.connect.description")}
        label={t("actions.connectFeature", {
          feature: t("fields.openai.label"),
        })}
      >
        {integrationOpenAI ? (
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
                    feature: t("fields.openai.label"),
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("messages.disconnectFeatureDescription", {
                    feature: t("fields.openai.label"),
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
          <OpenAIConnectDialog chatbotId={chatbotId} />
        )}
      </SettingRow>

      {integrationOpenAI && (
        <div className="mt-4 flex flex-col gap-4">
          <SettingRow
            description={t("automatedResponse.setting.description")}
            label={t("automatedResponse.setting.label")}
          >
            <ChangeAutoReply integrationOpenAI={integrationOpenAI} />
          </SettingRow>
        </div>
      )}
    </>
  )
}
