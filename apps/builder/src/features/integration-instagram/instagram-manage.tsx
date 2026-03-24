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
import { InstagramDisconnect } from "./components/instagram-disconnect"
import type { listIntegrationInstagrams } from "./queries"

type InstagramManageProps = {
  chatbotId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof listIntegrationInstagrams>>,
      Awaited<ReturnType<typeof findOrganization>>,
    ]
  >
}

export function InstagramManage({ chatbotId, promises }: InstagramManageProps) {
  const [{ data: integrationInstagrams }, organization] = use(promises)
  const t = useTranslations()

  const { data: settings } = organizationSettingsSchema.safeParse(
    organization?.settings,
  )
  if (!(organization && settings?.instagram)) {
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
            href={`/channels/create?channel=instagram&chatbotId=${chatbotId}`}
          >
            <PlusCircleIcon className="h-4 w-4" />
            {t("actions.addFeature", { feature: "Instagram" })}
          </Link>
        </Button>
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
            {integrationInstagrams.map((integrationInstagram) => (
              <TableRow key={integrationInstagram.id}>
                <TableCell>{integrationInstagram.name}</TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <Button size="sm" variant="secondary">
                    <Link
                      href={`/chatbots/${chatbotId}/instagrams/${integrationInstagram.id}/edit`}
                    >
                      {t("actions.manage")}
                    </Link>
                  </Button>
                  <InstagramDisconnect
                    integrationInstagram={integrationInstagram}
                  />
                </TableCell>
              </TableRow>
            ))}
            {integrationInstagrams.length === 0 && (
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
