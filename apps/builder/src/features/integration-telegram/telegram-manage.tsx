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
import { useTranslations } from "next-intl"
import { use } from "react"
import { TelegramConnect } from "./components/telegram-connect"
import { TelegramDisconnect } from "./components/telegram-disconnect"
import type { listIntegrationTelegrams } from "./queries"

type TelegramManageProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listIntegrationTelegrams>>]>
}

export function TelegramManage({ workspaceId, promises }: TelegramManageProps) {
  const [{ data: integrationTelegrams }] = use(promises)
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-2">
        <TelegramConnect workspaceId={workspaceId}>
          <Button size="sm" variant="secondary">
            <PlusCircleIcon className="h-4 w-4" />
            {t("actions.addFeature", { feature: t("fields.telegram.label") })}
          </Button>
        </TelegramConnect>
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
            {integrationTelegrams.map((integrationTelegram) => (
              <TableRow key={integrationTelegram.id}>
                <TableCell>@{integrationTelegram.name}</TableCell>
                <TableCell className="flex w-[200px] justify-end gap-2">
                  <TelegramDisconnect
                    integrationTelegram={integrationTelegram}
                  />
                </TableCell>
              </TableRow>
            ))}
            {integrationTelegrams.length === 0 && (
              <TableRow>
                <TableCell colSpan={3}>No data</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
