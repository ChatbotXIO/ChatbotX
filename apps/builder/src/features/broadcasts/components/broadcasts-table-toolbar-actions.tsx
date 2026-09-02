"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { BroadcastResourceWithRelations } from "../schema/resource"
import { DeleteBroadcastDialog } from "./delete-broadcast-dialog"

export function BroadcastsTableToolbarActions({
  table,
  workspaceId,
}: {
  table: Table<BroadcastResourceWithRelations>
  workspaceId: string
}) {
  const t = useTranslations()
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows

  if (selectedRows.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => setBulkDeleteOpen(true)}
        size="sm"
        variant="outline"
      >
        <Trash2Icon aria-hidden="true" className="me-2 size-4" />
        {t("actions.delete")} ({selectedRows.length})
      </Button>
      <DeleteBroadcastDialog
        broadcasts={selectedRows.map((row) => ({
          id: row.original.id,
          name: row.original.name,
        }))}
        onOpenChange={setBulkDeleteOpen}
        onSuccess={() => table.toggleAllRowsSelected(false)}
        open={bulkDeleteOpen}
        workspaceId={workspaceId}
      />
    </div>
  )
}
