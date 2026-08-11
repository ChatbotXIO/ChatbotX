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
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import { TokenRefreshErrorIcon } from "@/components/token-refresh-error-icon"
import { AddChannelButton } from "@/features/inboxes/components/add-channel-button"
import { useChannelDuplicatedError } from "@/hooks/use-channel-duplicated-error"
import { useChannelReconnectResult } from "@/hooks/use-channel-reconnect-result"
import { MessengerDisconnect } from "./components/messenger-disconnect"
import { MessengerReconnect } from "./components/messenger-reconnect"
import type { listIntegrationMessengers } from "./queries"

type MessengerManageProps = {
  canCreate?: boolean
  publicConfig: MessengerCredentialPublic | null
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationMessengers>>]>
}

export function MessengerManage({
  canCreate = true,
  publicConfig,
  workspaceId,
  promises,
}: MessengerManageProps) {
  const [{ data: integrationMessengers }] = use(promises)
  const t = useTranslations()

  useChannelDuplicatedError("messenger")
  useChannelReconnectResult()
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
        <AddChannelButton
          canCreate={canCreate}
          href={`/channels/create?workspaceId=${workspaceId}&channel=messenger`}
          label={t("fields.messenger.label")}
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
                <TableCell>
                  <div className="flex items-center gap-2">
                    {integrationMessenger.tokenRefreshError && (
                      <TokenRefreshErrorIcon
                        message={integrationMessenger.tokenRefreshError}
                      />
                    )}
                    {integrationMessenger.name}
                  </div>
                </TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <MessengerReconnect
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
