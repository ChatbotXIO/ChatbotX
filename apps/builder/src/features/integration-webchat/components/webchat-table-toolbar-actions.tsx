"use client"

import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"
import Link from "next/link"

type WebchatTableToolbarActionsProps = {
  workspaceId: string
  table: Table<IntegrationWebchatModel>
  onOpenChange: (open: boolean) => void
}

export function WebchatTableToolbarActions({
  workspaceId,
  // table,
}: WebchatTableToolbarActionsProps) {
  // const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // const selectedRows = table.getFilteredSelectedRowModel().rows
  // const selectedWebchats = selectedRows.map((row) => row.original)

  return (
    <>
      <div className="flex items-center gap-2">
        <Button size="sm">
          <Link
            className="flex items-center gap-2"
            href={`/space/${workspaceId}/webchats/create`}
          >
            <PlusIcon className="h-4 w-4" />
            Add Webchat
          </Link>
        </Button>
      </div>

      {/* <CreateWebchatDialog
        workspaceId={workspaceId}
        onOpenChange={setCreateDialogOpen}
        open={createDialogOpen}
      /> */}

      {/* <DeleteWebchatDialog
        workspaceId={workspaceId}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={() => {
          for (const row of selectedRows) {
            row.toggleSelected(false)
          }
        }}
        open={deleteDialogOpen}
        webchats={selectedWebchats}
      /> */}
    </>
  )
}
