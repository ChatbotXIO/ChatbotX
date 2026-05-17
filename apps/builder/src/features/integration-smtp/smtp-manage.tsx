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
import { PencilIcon, PlusCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use } from "react"
import { CreateSmtpDialog } from "./components/create-smtp-dialog"
import { EditSmtpDialog } from "./components/edit-smtp-dialog"
import { SmtpDisconnect } from "./components/smtp-disconnect"
import type { listIntegrationSmtps } from "./queries"

type SmtpManageProps = {
  readonly workspaceId: string
  readonly promises: Promise<Awaited<ReturnType<typeof listIntegrationSmtps>>>
}

export const SmtpManage = ({ workspaceId, promises }: SmtpManageProps) => {
  const { data: integrationSmtps } = use(promises)
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
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
              <TableHead className="w-50" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {integrationSmtps.map((integrationSmtp) => (
              <TableRow key={integrationSmtp.id}>
                <TableCell>{integrationSmtp.name}</TableCell>
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
                <TableCell colSpan={3}>No data</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
