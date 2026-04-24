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
import { PlusCircleIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use } from "react"
import { toast } from "sonner"
import { useTimeout } from "usehooks-ts"
import { ZaloDisconnect } from "./components/zalo-disconnect"
import type { listIntegrationZalo } from "./queries"

type ZaloManageProps = {
  isEnabled: boolean
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationZalo>>]>
}

export function ZaloManage({
  isEnabled,
  workspaceId,
  promises,
}: ZaloManageProps) {
  const [{ data: integrationZalos }] = use(promises)
  const t = useTranslations()
  const searchParams = useSearchParams()

  useTimeout(() => {
    if (searchParams.get("error") !== "duplicated") {
      return
    }
    toast.error(t("zalo.duplicated"))
  }, 0)

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
        <Button asChild size="sm" variant="secondary">
          <Link
            className="flex items-center gap-2"
            href={`/channels/create?channel=zalo&workspaceId=${workspaceId}`}
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
                <TableCell colSpan={2}>{t("messages.noData")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
