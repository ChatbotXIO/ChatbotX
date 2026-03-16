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
import { ZaloDisconnect } from "./components/zalo-disconnect"
import type { listIntegrationZalo } from "./queries"

type ZaloManageProps = {
  chatbotId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof listIntegrationZalo>>,
      Awaited<ReturnType<typeof findOrganization>>,
    ]
  >
}

export function ZaloManage({ chatbotId, promises }: ZaloManageProps) {
  const [{ data: integrationZalos }, organization] = use(promises)
  const t = useTranslations()

  const { data: settings } = organizationSettingsSchema.safeParse(
    organization?.settings,
  )
  if (!(organization && settings?.zalo)) {
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
            href={`/channels/create?channel=zalo&chatbotId=${chatbotId}`}
          >
            <PlusCircleIcon className="h-4 w-4" />
            {t("actions.addFeature", { feature: t("fields.zalo.label") })}
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
            {integrationZalos.map((integrationZalo) => (
              <TableRow key={integrationZalo.id}>
                <TableCell>{integrationZalo.name}</TableCell>
                <TableCell className="flex w-[200px] justify-end gap-2">
                  <Button size="sm" variant="secondary">
                    {t("zalo.refreshPermissions")}
                  </Button>
                  <ZaloDisconnect integrationZalo={integrationZalo} />
                </TableCell>
              </TableRow>
            ))}
            {integrationZalos.length === 0 && (
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
