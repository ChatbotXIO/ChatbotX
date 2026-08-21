"use client"

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
import { useChannelDuplicatedError } from "@/hooks/use-channel-duplicated-error"
import { ZaloDisconnect } from "./components/zalo-disconnect"
import { ZaloRefreshPermissions } from "./components/zalo-refresh-permissions"
import type { listIntegrationZalo } from "./queries"

type ZaloManageProps = {
  canCreate?: boolean
  isEnabled: boolean
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationZalo>>]>
}

export function ZaloManage({
  canCreate = true,
  isEnabled,
  workspaceId,
  promises,
}: ZaloManageProps) {
  const [{ data: integrationZalos }] = use(promises)
  const t = useTranslations()

  useChannelDuplicatedError("zalo")

  if (!isEnabled) {
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
          href={`/channels/create?channel=zalo&workspaceId=${workspaceId}`}
          label={t("fields.zalo.label")}
        />
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead className="w-[200px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrationZalos.map((integrationZalo) => (
              <TableRow key={integrationZalo.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {integrationZalo.tokenRefreshError && (
                      <TokenRefreshErrorIcon
                        message={integrationZalo.tokenRefreshError}
                      />
                    )}
                    {integrationZalo.name}
                  </div>
                </TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <ZaloRefreshPermissions integrationZalo={integrationZalo} />
                  <ZaloDisconnect integrationZalo={integrationZalo} />
                </TableCell>
              </TableRow>
            ))}
            {integrationZalos.length === 0 && (
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
