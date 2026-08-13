"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { AppointmentCalendarListItem } from "../schemas/resource"
import { CreateAppointmentCalendarDialog } from "./create-appointment-calendar-dialog"
import { DeleteAppointmentCalendarsDialog } from "./delete-appointment-calendars-dialog"

export function AppointmentCalendarsTableToolbarActions({
  table,
  workspaceId,
}: {
  workspaceId: string
  table: Table<AppointmentCalendarListItem>
}) {
  const t = useTranslations()
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows

  return (
    <div className="flex items-center gap-2">
      {selectedRows.length > 0 ? (
        <>
          <Button
            onClick={() => setBulkDeleteOpen(true)}
            size="sm"
            variant="outline"
          >
            <Trash2Icon aria-hidden="true" className="me-2 size-4" />
            {t("actions.delete")} ({selectedRows.length})
          </Button>
          <DeleteAppointmentCalendarsDialog
            calendars={selectedRows.map((row) => row.original)}
            onOpenChange={setBulkDeleteOpen}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            open={bulkDeleteOpen}
            workspaceId={workspaceId}
          />
        </>
      ) : null}

      <CreateAppointmentCalendarDialog workspaceId={workspaceId} />
    </div>
  )
}
