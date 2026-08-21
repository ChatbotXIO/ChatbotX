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
import { TiktokDisconnect } from "./components/tiktok-disconnect"
import { TiktokRefreshToken } from "./components/tiktok-refresh-token"
import type { listIntegrationTiktoks } from "./queries"

type TiktokManageProps = {
  canCreate?: boolean
  isEnabled: boolean
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationTiktoks>>]>
}

export function TiktokManage({
  canCreate = true,
  isEnabled,
  workspaceId,
  promises,
}: TiktokManageProps) {
  const [{ data: integrationTiktoks }] = use(promises)
  const t = useTranslations()

  useChannelDuplicatedError("tiktok")

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
          href={`/channels/create?channel=tiktok&workspaceId=${workspaceId}`}
          label={t("fields.tiktok.label")}
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
            {integrationTiktoks.map((integrationTiktok) => (
              <TableRow key={integrationTiktok.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {integrationTiktok.tokenRefreshError && (
                      <TokenRefreshErrorIcon
                        message={integrationTiktok.tokenRefreshError}
                      />
                    )}
                    {integrationTiktok.name}
                  </div>
                </TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <TiktokRefreshToken integrationTiktok={integrationTiktok} />
                  <TiktokDisconnect integrationTiktok={integrationTiktok} />
                </TableCell>
              </TableRow>
            ))}
            {integrationTiktoks.length === 0 && (
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
