"use client"

import type { ThreadsCredentialPublic } from "@chatbotx.io/database/partials"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
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
import { useChannelDuplicatedError } from "@/hooks/use-channel-duplicated-error"
import { ThreadsDisconnect } from "./components/threads-disconnect"
import { ThreadsReconnect } from "./components/threads-reconnect"
import type { listIntegrationThreads } from "./queries"

export function ThreadsManage({
  publicConfig,
  workspaceId,
  promises,
}: {
  publicConfig: ThreadsCredentialPublic | null
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationThreads>>]>
}) {
  const [{ data: integrations }] = use(promises)
  const t = useTranslations()

  useChannelDuplicatedError("threads")

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
        <Link
          className={buttonVariants({
            size: "sm",
            variant: "secondary",
            className: "flex items-center gap-2",
          })}
          href={`/channels/create?channel=threads&workspaceId=${workspaceId}`}
        >
          <PlusCircleIcon className="h-4 w-4" />
          {t("actions.addFeature", { feature: t("fields.threads.label") })}
        </Link>
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
            {integrations.map((integration) => (
              <TableRow key={integration.id}>
                <TableCell>{integration.name}</TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <ThreadsReconnect integrationThreads={integration} />
                  <ThreadsDisconnect integrationThreads={integration} />
                </TableCell>
              </TableRow>
            ))}
            {integrations.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>{t("messages.noData")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
