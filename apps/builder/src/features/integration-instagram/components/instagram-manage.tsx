"use client"

import type { InstagramCredentialPublic } from "@chatbotx.io/database/partials"
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
import { useChannelDuplicatedError } from "@/hooks/use-channel-duplicated-error"
import type { listIntegrationInstagrams } from "../queries"
import { AddInstagramDialog } from "./add-instagram-dialog"
import { InstagramDisconnect } from "./instagram-disconnect"
import { InstagramRefreshPermissions } from "./instagram-refresh-permissions"

type InstagramManageProps = {
  publicConfig: InstagramCredentialPublic | null
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationInstagrams>>]>
}

export function InstagramManage({
  publicConfig,
  workspaceId,
  promises,
}: InstagramManageProps) {
  const [{ data: integrationInstagrams }] = use(promises)
  const t = useTranslations()

  useChannelDuplicatedError("instagram")

  if (!publicConfig?.clientId) {
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
        <AddInstagramDialog workspaceId={workspaceId} />
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
                  <InstagramRefreshPermissions
                    integrationInstagram={integrationInstagram}
                  />
                  <Button size="sm" variant="secondary">
                    <Link
                      href={`/space/${workspaceId}/instagrams/${integrationInstagram.id}/edit`}
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
