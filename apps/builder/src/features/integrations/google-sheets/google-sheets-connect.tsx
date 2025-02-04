"use client"

import { SettingRow } from "@/components/setting-row"
import { Button } from "@/components/ui/button"
import { T } from "@tolgee/react"
import Link from "next/link"
import { use } from "react"
import type { getGoogleSheetsIntegration } from "./queries"

type GoogleSheetsConnectProps = {
  promises: Promise<[Awaited<ReturnType<typeof getGoogleSheetsIntegration>>]>
}

export function GoogleSheetsConnect({ promises }: GoogleSheetsConnectProps) {
  const [{ data }] = use(promises)

  return (
    <SettingRow
      label={<T keyName="settings.integrations.GoogleSheets.Title" />}
      description={
        <T keyName="settings.integrations.GoogleSheets.Descriptions" />
      }
    >
      {data ? (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" size="sm">
            <Link href="../google-sheets" replace={true}>
              <T keyName="settings.integrations.ManageBtn" />
            </Link>
          </Button>

          <Button variant="destructive" size="sm">
            <T keyName="settings.integrations.DisconnectBtn" />
          </Button>
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
  )
}
