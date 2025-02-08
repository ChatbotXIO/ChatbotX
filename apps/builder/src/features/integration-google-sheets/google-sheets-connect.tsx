"use client"

import { SettingRow } from "@/components/setting-row"
import { Button } from "@/components/ui/button"
import { T } from "@tolgee/react"
import { Loader2Icon } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import Link from "next/link"
import { use } from "react"
import { connectGoogleSheets } from "./actions/connect.action"
import { disconnectGoogleSheets } from "./actions/disconnect.action"
import type { getGoogleSheetsIntegration } from "./queries"

type GoogleSheetsConnectProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof getGoogleSheetsIntegration>>]>
}

export function GoogleSheetsConnect({
  chatbotId,
  promises,
}: GoogleSheetsConnectProps) {
  const [{ data: integrationGoogleSheets }] = use(promises)

  const { executeAsync: onConnect, isPending: isPendingConnect } = useAction(
    connectGoogleSheets.bind(null, chatbotId),
  )
  const { executeAsync: onDisconnect, isPending: isPendingDisconnect } =
    useAction(disconnectGoogleSheets.bind(null, chatbotId))

  return (
    <SettingRow
      label={<T keyName="settings.integrations.GoogleSheets.Title" />}
      description={
        <T keyName="settings.integrations.GoogleSheets.Descriptions" />
      }
    >
      {integrationGoogleSheets ? (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm">
            <Link href="../google-sheets" replace={true}>
              <T keyName="settings.integrations.ManageBtn" />
            </Link>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={async (e) => {
              e.preventDefault()
              await onDisconnect()
            }}
            disabled={isPendingDisconnect}
          >
            {isPendingDisconnect && <Loader2Icon className="animate-spin" />}
            <T keyName="settings.integrations.DisconnectBtn" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={async (e) => {
            e.preventDefault()
            await onConnect({ referer: window.location.href })
          }}
          disabled={isPendingConnect}
        >
          {isPendingConnect && <Loader2Icon className="animate-spin" />}
          <T keyName="common.integrations.Connect" />
        </Button>
      )}
    </SettingRow>
  )
}
