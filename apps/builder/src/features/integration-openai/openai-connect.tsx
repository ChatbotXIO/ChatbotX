"use client"

import { SettingRow } from "@/components/setting-row"
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
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { T } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { use } from "react"
import { disconnectOpenAIAction } from "./actions/disconnect.action"
import { OpenAIConnectDialog } from "./openai-connect-dialog"
import type { findIntegrationOpenAI } from "./queries"

type OpenAIConnectProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof findIntegrationOpenAI>>]>
}

export const OpenAIConnect = ({ chatbotId, promises }: OpenAIConnectProps) => {
  const [{ data: integrationOpenAI }] = use(promises)
  const router = useRouter()

  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectOpenAIAction.bind(null, chatbotId), {
      onSuccess: () => {
        router.refresh()
      },
    })

  return (
    <>
      <SettingRow
        label={<T keyName="settings.integrations.OpenAI.Title" />}
        description={<T keyName="settings.integrations.OpenAI.Descriptions" />}
      >
        {integrationOpenAI ? (
          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="sm">
              <Link href="../google-sheets">
                <T keyName="settings.integrations.ManageBtn" />
              </Link>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
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
                    onClick={async (e) => {
                      e.preventDefault()
                      await onDisconnect()
                    }}
                    disabled={isPendingDisconnect}
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
        <div className="flex flex-col gap-4 mt-4">
          <SettingRow
            label={
              <T keyName="settings.integrations.AutomatedResponses.Title" />
            }
            description={
              <T keyName="settings.integrations.AutomatedResponses.Descriptions" />
            }
          >
            <Switch
              disabled={true}
              checked={integrationOpenAI.automatedResponse}
            />
          </SettingRow>

          <SettingRow
            label={<T keyName="settings.integrations.Agents.Title" />}
            description={
              <T keyName="settings.integrations.Agents.Descriptions" />
            }
          >
            <Button variant="secondary" size="sm" asChild>
              <Link href="../ai-agents">
                <T keyName="settings.integrations.ManageBtn" />
              </Link>
            </Button>
          </SettingRow>

          <SettingRow
            label={<T keyName="settings.integrations.AITriggers.Title" />}
            description={
              <T keyName="settings.integrations.AITriggers.Descriptions" />
            }
          >
            <Button variant="secondary" size="sm">
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
