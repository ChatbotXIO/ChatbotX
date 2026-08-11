"use client"

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
import type { listIntegrationWhatsapps } from "./queries"
import { WhatsappDisconnectDialog } from "./whatsapp-disconnect-dialog"

type WhatsappManageProps = {
  canCreate?: boolean
  isEnabled: boolean
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationWhatsapps>>]>
}

export function WhatsappManage({
  canCreate = true,
  isEnabled,
  workspaceId,
  promises,
}: WhatsappManageProps) {
  const [{ data: integrationWhatsapps }] = use(promises)
  const t = useTranslations()

  useChannelDuplicatedError("whatsapp")

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
          href={`/channels/create?channel=whatsapp&workspaceId=${workspaceId}`}
          label={t("fields.whatsapp.label")}
        />
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-[200px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrationWhatsapps.map((integrationWhatsapp) => (
              <TableRow key={integrationWhatsapp.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {integrationWhatsapp.tokenRefreshError && (
                      <TokenRefreshErrorIcon
                        message={integrationWhatsapp.tokenRefreshError}
                      />
                    )}
                    {integrationWhatsapp.inbox?.name}
                  </div>
                </TableCell>
                <TableCell className="flex w-[200px] justify-end gap-2">
                  <Button size="sm" variant="secondary">
                    <Link
                      href={`/space/${workspaceId}/whatsapps/${integrationWhatsapp.id}/useful-links`}
                    >
                      {t("actions.manage")}
                    </Link>
                  </Button>
                  <WhatsappDisconnectDialog
                    integrationWhatsappId={integrationWhatsapp.id}
                    workspaceId={workspaceId}
                  />
                </TableCell>
              </TableRow>
            ))}
            {integrationWhatsapps.length === 0 && (
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
