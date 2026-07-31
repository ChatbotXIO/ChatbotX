"use client"

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
import { TiktokDisconnect } from "./components/tiktok-disconnect"
import { TiktokRefreshToken } from "./components/tiktok-refresh-token"
import type { listIntegrationTiktoks } from "./queries"

type TiktokManageProps = {
  isEnabled: boolean
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationTiktoks>>]>
}

export function TiktokManage({
  isEnabled,
  workspaceId,
  promises,
}: TiktokManageProps) {
  const [{ data: integrationTiktoks }] = use(promises)
  const t = useTranslations()

  useChannelDuplicatedError("tiktok")

  if (!isEnabled) {
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
          href={`/channels/create?channel=tiktok&workspaceId=${workspaceId}`}
        >
          <PlusCircleIcon className="h-4 w-4" />
          {t("actions.addFeature", { feature: t("fields.tiktok.label") })}
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
            {integrationTiktoks.map((integrationTiktok) => (
              <TableRow key={integrationTiktok.id}>
                <TableCell>{integrationTiktok.name}</TableCell>
                <TableCell className="flex w-50 justify-end gap-2">
                  <TiktokRefreshToken integrationTiktok={integrationTiktok} />
                  <TiktokDisconnect integrationTiktok={integrationTiktok} />
                </TableCell>
              </TableRow>
            ))}
            {integrationTiktoks.length === 0 && (
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
