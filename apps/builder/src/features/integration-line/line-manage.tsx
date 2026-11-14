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
import { PlusCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use } from "react"
import { AddChannelButton } from "@/features/inboxes/components/add-channel-button"
import { InboxMarkReadOnOutboundSwitch } from "@/features/inboxes/components/inbox-mark-read-on-outbound-switch"
import { useChannelConnectError } from "@/hooks/use-channel-connect-error"
import { LineConnect } from "./components/line-connect"
import { LineDisconnect } from "./components/line-disconnect"
import { LineTestWebhook } from "./components/line-test-webhook"
import type { listIntegrationLines } from "./queries"

type LineManageProps = {
  canCreate?: boolean
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationLines>>]>
}

export function LineManage({
  canCreate = true,
  workspaceId,
  promises,
}: LineManageProps) {
  const [{ data: integrationLines }] = use(promises)
  const t = useTranslations()

  useChannelConnectError("line")

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-2">
        <AddChannelButton
          canCreate={canCreate}
          label={t("fields.line.label")}
          render={
            <LineConnect workspaceId={workspaceId}>
              <Button size="sm" variant="secondary">
                <PlusCircleIcon className="h-4 w-4" />
                {t("actions.addFeature", { feature: t("fields.line.label") })}
              </Button>
            </LineConnect>
          }
        />
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("inboxes.markReadOnOutbound.label")}</TableHead>
              <TableHead className="w-60" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrationLines.map((integrationLine) => (
              <TableRow key={integrationLine.id}>
                <TableCell>
                  {integrationLine.name} ({integrationLine.basicId})
                </TableCell>
                <TableCell>
                  <InboxMarkReadOnOutboundSwitch
                    inboxId={integrationLine.inboxId}
                    workspaceId={workspaceId}
                  />
                </TableCell>
                <TableCell className="flex w-60 justify-end gap-2">
                  <LineTestWebhook
                    integrationId={integrationLine.id}
                    workspaceId={workspaceId}
                  />
                  <LineDisconnect integrationId={integrationLine.id} />
                </TableCell>
              </TableRow>
            ))}
            {integrationLines.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>{t("analytics.noData")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
