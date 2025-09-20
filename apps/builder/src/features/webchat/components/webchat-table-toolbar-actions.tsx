"use client"

import type { IntegrationWebchatModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { PlusIcon } from "lucide-react"
import Link from "next/link"

type WebchatTableToolbarActionsProps = {
  chatbotId: string
  table: Table<IntegrationWebchatModel>
  onOpenChange: (open: boolean) => void
}

export function WebchatTableToolbarActions({
  chatbotId,
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
            href={`/chatbots/${chatbotId}/webchats/create`}
          >
            <PlusIcon className="h-4 w-4" />
            Add Webchat
          </Link>
        </Button>
      </div>

      {/* <CreateWebchatDialog
        chatbotId={chatbotId}
        onOpenChange={setCreateDialogOpen}
        open={createDialogOpen}
      /> */}

      {/* <DeleteWebchatDialog
        chatbotId={chatbotId}
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
