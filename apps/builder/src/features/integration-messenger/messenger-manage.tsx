"use client"

import type { MessengerCredentialPublic } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import { MessengerConnect } from "./components/messenger-connect"
import { MessengerDisconnect } from "./components/messenger-disconnect"
import { MessengerRefreshPermissions } from "./components/messenger-refresh-permissions"
import type { listIntegrationMessengers } from "./queries"

type MessengerManageProps = {
  publicConfig: MessengerCredentialPublic | null
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationMessengers>>]>
}

export function MessengerManage({
  publicConfig,
  workspaceId,
  promises,
}: MessengerManageProps) {
  const [{ data: integrationMessengers }] = use(promises)
  const t = useTranslations()
  if (!publicConfig?.clientId) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          {t("messages.needToAddSettings")}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-2">
        <MessengerConnect
          publicConfig={publicConfig}
          trigger={
            <div className="flex items-center gap-2">
              <PlusCircleIcon className="h-4 w-4" />
              {t("actions.addFeature", {
                feature: t("fields.messenger.label"),
              })}
            </div>
          }
          workspaceId={workspaceId}
        />
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead className="w-50" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrationMessengers.map((integrationMessenger) => (
              <TableRow key={integrationMessenger.id}>
                <TableCell>{integrationMessenger.name}</TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <MessengerRefreshPermissions
                    integrationMessenger={integrationMessenger}
                  />
                  <Button size="sm" variant="secondary">
                    <Link
                      href={`/space/${workspaceId}/messengers/${integrationMessenger.id}/edit`}
                    >
                      {t("actions.manage")}
                    </Link>
                  </Button>
                  <MessengerDisconnect
                    integrationMessenger={integrationMessenger}
                  />
                </TableCell>
              </TableRow>
            ))}
            {integrationMessengers.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>No data</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
