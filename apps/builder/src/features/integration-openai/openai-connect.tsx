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
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use } from "react"
import { SettingRow } from "@/components/setting-row"
import { disconnectOpenAIAction } from "./actions/disconnect.action"
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
    })

  return (
    <>
      <SettingRow
        description={t("openAI.connect.description")}
        label={t("openAI.connect.title")}
      >
        {integrationOpenAI ? (
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="secondary">
              <Link href="../google-sheets">{t("actions.manage")}</Link>
            </Button>

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
                      feature: t("fields.openai.label"),
                    })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("dialog.disconnect.description", {
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
          </div>
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
            <Switch
              checked={integrationOpenAI.automatedResponse}
              disabled={true}
            />
          </SettingRow>

          <SettingRow
            description={t("aiAgent.setting.description")}
            label={t("aiAgent.setting.label")}
          >
            <Button asChild size="sm" variant="secondary">
              <Link href="../ai-agents">{t("actions.manage")}</Link>
            </Button>
          </SettingRow>

          <SettingRow
            description={t("aiTrigger.setting.description")}
            label={t("aiTrigger.setting.label")}
          >
            <Button size="sm" variant="secondary">
              <Link href="../ai-triggers">{t("actions.manage")}</Link>
            </Button>
          </SettingRow>
        </div>
      )}
    </>
  )
}
