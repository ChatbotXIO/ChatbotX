"use client"

import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import React from "react"
import { WhatsappMessageTemplatesTableToolbarActions } from "./message-templates-table-toolbar-actions"
import type { WhatsappMessageTemplateResource } from "./schema/resource"

type WhatsappMessageTemplatesTableProps = {
  integrationWhatsapp: IntegrationWhatsappModel
  promises: Promise<WhatsappMessageTemplateResource[]>
}

export function WhatsappMessageTemplatesTable({
  integrationWhatsapp,
  promises,
}: WhatsappMessageTemplatesTableProps) {
  const t = useTranslations()
  const data = React.use(promises)

  const auth = integrationWhatsapp.auth as unknown as WhatsappAuthValue

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary">
          <Link
            href={`https://business.facebook.com/latest/whatsapp_manager/message_templates?business_id=${auth.metadata.businessId}&asset_id=${auth.metadata.wabaId}`}
            target="_blank"
          >
            {t("actions.manage")}
          </Link>
        </Button>
      </div>
      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead>{t("fields.language.label")}</TableHead>
              <TableHead>{t("fields.category.label")}</TableHead>
              <TableHead>{t("fields.status.label")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((mt) => (
              <TableRow key={mt.id}>
                <TableCell>{mt.name}</TableCell>
                <TableCell>{mt.language}</TableCell>
                <TableCell>{mt.category}</TableCell>
                <TableCell>{mt.status}</TableCell>
                <TableCell>
                  <Link
                    href={`https://business.facebook.com/latest/whatsapp_manager/template_details/?business_id=${auth.metadata.businessId}&tab=mt-edit&id=${mt.id}&nav_ref=whatsapp_manager&asset_id=${auth.metadata.wabaId}`}
                    target="_blank"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell className="text-center" colSpan={5}>
                  {t("messages.noData")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col items-center justify-center p-4">
        <WhatsappMessageTemplatesTableToolbarActions
          integrationWhatsappId={integrationWhatsapp.id}
          workspaceId={integrationWhatsapp.workspaceId}
        />
      </div>
    </div>
  )
}
