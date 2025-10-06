"use client"

import { organizationSettingsSchema } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@aha.chat/ui/components/ui/table"
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import type { findOrganization } from "../organization/queries"
import type { listIntegrationWhatsapps } from "./queries"
import { WhatsappDisconnectDialog } from "./whatsapp-disconnect-dialog"

type WhatsappManageProps = {
  chatbotId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof listIntegrationWhatsapps>>,
      Awaited<ReturnType<typeof findOrganization>>,
    ]
  >
}

export function WhatsappManage({ chatbotId, promises }: WhatsappManageProps) {
  const [{ data: integrationWhatsapps }, organization] = use(promises)
  const t = useTranslations()

  const { data: settings } = organizationSettingsSchema.safeParse(
    organization.settings,
  )
  if (!settings?.whatsapp) {
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
        <Button size="sm" variant="secondary">
          <Link
            className="flex items-center gap-2"
            href={`/channels/create?channel=whatsapp&chatbotId=${chatbotId}`}
          >
            <PlusCircleIcon className="h-4 w-4" />
            {t("actions.addFeature", { feature: t("fields.whatsapp.label") })}
          </Link>
        </Button>
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
                <TableCell>{integrationWhatsapp.name}</TableCell>
                <TableCell className="flex w-[200px] justify-end gap-2">
                  <Button size="sm" variant="secondary">
                    <Link
                      href={`/chatbots/${chatbotId}/whatsapps/${integrationWhatsapp.id}/useful-links`}
                    >
                      {t("actions.manage")}
                    </Link>
                  </Button>
                  <WhatsappDisconnectDialog
                    chatbotId={chatbotId}
                    integrationWhatsappId={integrationWhatsapp.id}
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
