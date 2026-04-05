"use client"

import { organizationSettingsSchema } from "@chatbotx.io/database/partials"
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
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use } from "react"
import type { findOrganization } from "../organization/queries"
import { MessengerDisconnect } from "./components/messenger-disconnect"
import type { listIntegrationMessengers } from "./queries"

type WhatsappManageProps = {
  workspaceId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof listIntegrationMessengers>>,
      Awaited<ReturnType<typeof findOrganization>>,
    ]
  >
}

export function MessengerManage({
  workspaceId,
  promises,
}: WhatsappManageProps) {
  const [{ data: integrationMessengers }, organization] = use(promises)
  const t = useTranslations()

  const { data: settings } = organizationSettingsSchema.safeParse(
    organization?.settings,
  )
  if (!(organization && settings?.messenger)) {
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
            href={`/channels/create?channel=messenger&workspaceId=${workspaceId}`}
          >
            <PlusCircleIcon className="h-4 w-4" />
            {t("actions.addFeature", { feature: t("fields.messenger.label") })}
          </Link>
        </Button>
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
            {integrationMessengers.map((integrationMessenger) => (
              <TableRow key={integrationMessenger.id}>
                <TableCell>{integrationMessenger.name}</TableCell>
                <TableCell className="flex w-[200px] justify-end gap-2">
                  <Button size="sm" variant="secondary">
                    {t("messenger.refreshPermissions")}
                  </Button>
                  <Button size="sm" variant="secondary">
                    <Link
                      href={`/space/${workspaceId}/messengers/${integrationMessenger.id}/edit`}
                    >
                      {t("actions.manage")}
                    </Link>
                  </Button>
                  <MessengerDisconnect
                    integrationMessenger={integrationMessenger}
                  />
                </TableCell>
              </TableRow>
            ))}
            {integrationMessengers.length === 0 && (
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
