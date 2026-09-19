"use client"

import type { ThreadsCredentialPublic } from "@chatbotx.io/database/partials"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { useTranslations } from "next-intl"
import { use } from "react"
import { TokenRefreshErrorIcon } from "@/components/token-refresh-error-icon"
import { AddChannelButton } from "@/features/inboxes/components/add-channel-button"
import { useChannelConnectError } from "@/hooks/use-channel-connect-error"
import { useChannelReconnectResult } from "@/hooks/use-channel-reconnect-result"
import { ThreadsDisconnect } from "./components/threads-disconnect"
import { ThreadsReconnect } from "./components/threads-reconnect"
import type { listIntegrationThreads } from "./queries"

export function ThreadsManage({
  canCreate = true,
  publicConfig,
  workspaceId,
  promises,
}: {
  canCreate?: boolean
  publicConfig: ThreadsCredentialPublic | null
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationThreads>>]>
}) {
  const [{ data: integrations }] = use(promises)
  const t = useTranslations()

  useChannelConnectError("threads")
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
          href={`/channels/create?channel=threads&workspaceId=${workspaceId}`}
          label={t("fields.threads.label")}
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
            {integrations.map((integration) => (
              <TableRow key={integration.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {integration.tokenRefreshError && (
                      <TokenRefreshErrorIcon
                        message={integration.tokenRefreshError}
                      />
                    )}
                    {integration.name}
                  </div>
                </TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <ThreadsReconnect integrationThreads={integration} />
                  <ThreadsDisconnect integrationThreads={integration} />
                </TableCell>
              </TableRow>
            ))}
            {integrations.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>{t("messages.noData")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
