"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { listExternalCalendars } from "../queries"
import type { ExternalCalendarResource } from "../schemas/resource"
import { ConnectProviderMenu } from "./connect-provider-menu"
import { DisconnectCalendarDialog } from "./disconnect-calendar-dialog"
import { EditCalendarIdDialog } from "./edit-calendar-id-dialog"
import { getExternalCalendarColumns } from "./external-calendars-table-columns"

type Props = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listExternalCalendars>>]>
}

export function ExternalCalendarsTable({ workspaceId, promises }: Props) {
  const t = useTranslations()
  const searchParams = useSearchParams()
  const callbackStatus = searchParams.get("externalCalendarConnect")
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<ExternalCalendarResource> | null>(null)
  const columns = useMemo(
    () => getExternalCalendarColumns({ t, setRowAction }),
    [t],
  )
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  useEffect(() => {
    if (callbackStatus === "success") {
      toast.success(t("externalCalendars.messages.connected"))
    }
    if (callbackStatus === "error") {
      toast.error(t("externalCalendars.messages.connectFailed"))
    }
    if (callbackStatus) {
      const url = new URL(window.location.href)
      url.searchParams.delete("externalCalendarConnect")
      window.history.replaceState(null, "", url.toString())
    }
  }, [callbackStatus, t])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-bold text-xl">
          {t("externalCalendars.title")}
        </CardTitle>
        <ConnectProviderMenu workspaceId={workspaceId} />
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table} />
        </DataTable>
        <EditCalendarIdDialog
          connection={rowAction?.row.original ?? null}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "update"}
          workspaceId={workspaceId}
        />
        <DisconnectCalendarDialog
          connection={rowAction?.row.original ?? null}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
