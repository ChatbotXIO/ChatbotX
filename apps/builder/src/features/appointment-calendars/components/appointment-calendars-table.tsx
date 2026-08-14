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
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type { listAppointmentCalendars } from "../queries"
import type { AppointmentCalendarListItem } from "../schemas/resource"
import { getAppointmentCalendarColumns } from "./appointment-calendars-table-columns"
import { AppointmentCalendarsTableToolbarActions } from "./appointment-calendars-table-toolbar-actions"
import { DeleteAppointmentCalendarsDialog } from "./delete-appointment-calendars-dialog"
import { DuplicateAppointmentCalendarDialog } from "./duplicate-appointment-calendar-dialog"
import { RenameAppointmentCalendarDialog } from "./rename-appointment-calendar-dialog"

type Props = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listAppointmentCalendars>>]>
}

export function AppointmentCalendarsTable({ workspaceId, promises }: Props) {
  const t = useTranslations()
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AppointmentCalendarListItem> | null>(null)
  const columns = useMemo(
    () => getAppointmentCalendarColumns({ t, setRowAction }),
    [t],
  )
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "name", desc: false }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("appointmentCalendars.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <AppointmentCalendarsTableToolbarActions
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>
        <RenameAppointmentCalendarDialog
          calendar={rowAction?.row.original ?? null}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "rename"}
          workspaceId={workspaceId}
        />
        <DuplicateAppointmentCalendarDialog
          calendar={rowAction?.row.original ?? null}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "duplicate"}
          workspaceId={workspaceId}
        />
        <DeleteAppointmentCalendarsDialog
          calendars={rowAction?.row.original ? [rowAction.row.original] : []}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
