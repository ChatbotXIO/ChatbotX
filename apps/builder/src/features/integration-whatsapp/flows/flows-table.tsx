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
import { WhatsappFlowsTableToolbarActions } from "./flows-table-toolbar-actions"
import type { WhatsappFlowResource } from "./schema/resource"

type WhatsappFlowsTableProps = {
  integrationWhatsapp: IntegrationWhatsappModel
  promises: Promise<WhatsappFlowResource[]>
}

export function WhatsappFlowsTable({
  integrationWhatsapp,
  promises,
}: WhatsappFlowsTableProps) {
  const t = useTranslations()
  const data = React.use(promises)

  const auth = integrationWhatsapp.auth as unknown as WhatsappAuthValue

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <WhatsappFlowsTableToolbarActions
          integrationWhatsappId={integrationWhatsapp.id}
          workspaceId={integrationWhatsapp.workspaceId}
        />
        <Button size="sm" variant="secondary">
          <Link
            href={`https://business.facebook.com/latest/whatsapp_manager/flows?business_id=${auth.metadata.businessId}&asset_id=${auth.metadata.wabaId}`}
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
              <TableHead>{t("fields.status.label")}</TableHead>
              <TableHead>{t("fields.completed.label")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((flow) => (
              <TableRow key={flow.id}>
                <TableCell>{flow.name}</TableCell>
                <TableCell>{flow.status}</TableCell>
                <TableCell>{flow.completedCount}</TableCell>
                <TableCell>
                  <Link
                    href={`https://business.facebook.com/latest/whatsapp_manager/flow_edit/?business_id=${auth.metadata.businessId}&tab=flow-edit&id=${flow.sourceId}&nav_ref=whatsapp_manager&asset_id=${auth.metadata.wabaId}`}
                    target="_blank"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell className="text-center" colSpan={4}>
                  {t("messages.noData")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
