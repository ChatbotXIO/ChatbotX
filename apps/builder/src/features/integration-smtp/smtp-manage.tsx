"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { PencilIcon, PlusCircleIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { use } from "react"
import { CreateSmtpDialog } from "./components/create-smtp-dialog"
import { EditSmtpDialog } from "./components/edit-smtp-dialog"
import { SmtpDisconnect } from "./components/smtp-disconnect"
import type { listIntegrationSmtps } from "./queries"
import type { IntegrationSmtpResource } from "./schema/resource"

type SmtpManageProps = {
  readonly workspaceId: string
  readonly promises: Promise<Awaited<ReturnType<typeof listIntegrationSmtps>>>
}

type ReceivingMode = "imap" | "webhook" | "off"

const receivingModeOf = (smtp: IntegrationSmtpResource): ReceivingMode => {
  if (smtp.imapEnabled) {
    return "imap"
  }
  return smtp.inboundWebhookIssued ? "webhook" : "off"
}

const receivingLabelKey = {
  imap: "smtp.guide.status.receivingImap",
  webhook: "smtp.guide.status.receivingWebhook",
  off: "smtp.guide.status.receivingOff",
} as const satisfies Record<ReceivingMode, string>

export const SmtpManage = ({ workspaceId, promises }: SmtpManageProps) => {
  const { data: integrationSmtps } = use(promises)
  const t = useTranslations()
  const format = useFormatter()

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        {t("smtp.setting.description")}
      </p>
      <div className="flex justify-end gap-2">
        <CreateSmtpDialog workspaceId={workspaceId}>
          <Button size="sm" variant="secondary">
            <PlusCircleIcon className="h-4 w-4" />
            {t("actions.addFeature", { feature: "SMTP" })}
          </Button>
        </CreateSmtpDialog>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("smtp.guide.status.title")}</TableHead>
              <TableHead className="w-50" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrationSmtps.map((integrationSmtp) => (
              <TableRow key={integrationSmtp.id}>
                <TableCell>{integrationSmtp.name}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary">
                        {t("smtp.guide.status.sending")}
                      </Badge>
                      <Badge
                        variant={
                          receivingModeOf(integrationSmtp) === "off"
                            ? "outline"
                            : "secondary"
                        }
                      >
                        {t(receivingLabelKey[receivingModeOf(integrationSmtp)])}
                      </Badge>
                    </div>
                    {integrationSmtp.imapEnabled && (
                      <span className="text-muted-foreground text-xs">
                        {integrationSmtp.lastPolledAt
                          ? t("smtp.guide.status.lastPolled", {
                              time: format.relativeTime(
                                new Date(integrationSmtp.lastPolledAt),
                              ),
                            })
                          : t("smtp.guide.status.neverPolled")}
                      </span>
                    )}
                    {integrationSmtp.lastPollError && (
                      <span className="text-destructive text-xs">
                        {t("smtp.guide.status.error", {
                          error: integrationSmtp.lastPollError,
                        })}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <EditSmtpDialog
                    integrationSmtp={integrationSmtp}
                    workspaceId={workspaceId}
                  >
                    <Button size="sm" variant="outline">
                      <PencilIcon className="h-4 w-4" />
                      {t("actions.edit")}
                    </Button>
                  </EditSmtpDialog>
                  <SmtpDisconnect integrationSmtp={integrationSmtp} />
                </TableCell>
              </TableRow>
            ))}
            {integrationSmtps.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>{t("messages.noData")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
