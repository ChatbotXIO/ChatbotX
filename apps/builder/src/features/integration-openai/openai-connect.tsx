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
import { T, useTranslate } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
  const { t } = useTranslate()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectOpenAIAction.bind(null, chatbotId), {
      onSuccess: () => {
        router.refresh()
      },
    })

  return (
    <>
      <SettingRow
        description={t("settings.integrations.OpenAI.Descriptions")}
        label={t("settings.integrations.OpenAI.Title")}
      >
        {integrationOpenAI ? (
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="secondary">
              <Link href="../google-sheets">
                <T keyName="settings.integrations.ManageBtn" />
              </Link>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive">
                  <T keyName="settings.integrations.DisconnectBtn" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    <T keyName="Integration.Disconnect.Confirm" />
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    <T keyName="Integration.Disconnect.Description" />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    <T keyName="Integration.CancelBtn" />
                  </AlertDialogCancel>
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
                    <T keyName="settings.integrations.DisconnectBtn" />
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
            description={t(
              "settings.integrations.AutomatedResponses.Descriptions",
            )}
            label={t("settings.integrations.AutomatedResponses.Title")}
          >
            <Switch
              checked={integrationOpenAI.automatedResponse}
              disabled={true}
            />
          </SettingRow>

          <SettingRow
            description={t("settings.integrations.Agents.Descriptions")}
            label={t("settings.integrations.Agents.Title")}
          >
            <Button asChild size="sm" variant="secondary">
              <Link href="../ai-agents">
                <T keyName="settings.integrations.ManageBtn" />
              </Link>
            </Button>
          </SettingRow>

          <SettingRow
            description={t("settings.integrations.AITriggers.Descriptions")}
            label={t("settings.integrations.AITriggers.Title")}
          >
            <Button size="sm" variant="secondary">
              <Link href="../ai-triggers">
                <T keyName="settings.integrations.ManageBtn" />
              </Link>
            </Button>
          </SettingRow>
        </div>
      )}
    </>
  )
}
