"use client"

import type { DecisionConnectionSafe } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { DecisionProfileListItem } from "../schema/resource"
import { DeleteDecisionProfilesDialog } from "./delete-decision-profiles-dialog"
import { ProfileEditor } from "./profile-editor"

type Props = {
  connections: DecisionConnectionSafe[]
  table: Table<DecisionProfileListItem>
  workspaceId: string
}

export function DecisionProfilesTableToolbarActions({
  connections,
  table,
  workspaceId,
}: Props) {
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const t = useTranslations()
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
          <DeleteDecisionProfilesDialog
            onOpenChange={setBulkDeleteOpen}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            open={bulkDeleteOpen}
            profiles={selectedRows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
        </>
      ) : null}
      <ProfileEditor connections={connections} />
    </div>
  )
}
