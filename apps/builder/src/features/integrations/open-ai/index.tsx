"use client"

import { SettingRow } from "@/components/setting-row"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import IntegrationDialogDisconnect from "@/features/integrations/components/dialog-disconnect"
import OpenAIDialogEdit from "@/features/integrations/open-ai/components/dialog-edit"
import type { getOpenAIIntegration } from "@/features/integrations/open-ai/queries"
import { T } from "@tolgee/react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { use } from "react"

type OpenAIConnectProps = {
  promises: Promise<[Awaited<ReturnType<typeof getOpenAIIntegration>>]>
}

export function OpenAIConnect({ promises }: OpenAIConnectProps) {
  const [{ data }] = use(promises)
  const params = useParams()

  const onDisconnect = () => {}

  return (
    <>
      <SettingRow
        label={<T keyName="settings.integrations.OpenAI.Title" />}
        description={<T keyName="settings.integrations.OpenAI.Descriptions" />}
        className="mb-4"
      >
        {data?.isConnect ? (
          <div className="flex flex-col gap-2">
            <OpenAIDialogEdit chatbotId={`${params?.chatbotId}`} />

            <IntegrationDialogDisconnect
              title="Do you want to Disconnect OpenAI?"
              disconnect={onDisconnect}
            />
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => console.log("press connect button")}
          >
            <T keyName="common.Connect" />
          </Button>
        )}
      </SettingRow>

      {data?.isConnect && (
        <div className="flex flex-col gap-4">
          <SettingRow
            label={
              <T keyName="settings.integrations.AutomatedResponses.Title" />
            }
            description={
              <T keyName="settings.integrations.AutomatedResponses.Descriptions" />
            }
            className="items-center"
          >
            <Switch />
          </SettingRow>

          <SettingRow
            label={<T keyName="settings.integrations.Agents.Title" />}
            description={
              <T keyName="settings.integrations.Agents.Descriptions" />
            }
            className="items-center"
          >
            <Button variant="secondary" asChild>
              <Link href="../openai-prompts">
                <T keyName="settings.integrations.ManageBtn" />
              </Link>
            </Button>
          </SettingRow>

          <SettingRow
            label={<T keyName="settings.integrations.Assistants.Title" />}
            description={
              <T keyName="settings.integrations.Assistants.Descriptions" />
            }
            className="items-center"
          >
            <Button variant="secondary">
              <Link href="../openai-assistants">
                <T keyName="settings.integrations.ManageBtn" />
              </Link>
            </Button>
          </SettingRow>

          <SettingRow
            label={<T keyName="settings.integrations.AITriggers.Title" />}
            description={
              <T keyName="settings.integrations.AITriggers.Descriptions" />
            }
            className="items-center"
          >
            <Button variant="secondary">
              <Link href="../chatgpt-triggers">
                <T keyName="settings.integrations.ManageBtn" />
              </Link>
            </Button>
          </SettingRow>
        </div>
      )}
    </>
  )
}
