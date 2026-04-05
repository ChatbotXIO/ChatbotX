import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { CreateBotFieldDialog } from "./create-bot-field-dialog"
import { DeleteBotFieldsDialog } from "./delete-bot-fields-dialog"
import type { BotFieldResource } from "./schemas/resource"

export function BotFieldToolbarActions({
  workspaceId,
  folderId,
  table,
}: {
  workspaceId: string
  folderId: string | null
  table: Table<BotFieldResource>
}) {
  const router = useRouter()

  return (
    <>
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteBotFieldsDialog
          onSuccess={() => {
            router.refresh()
          }}
          records={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          workspaceId={workspaceId}
        />
      ) : null}

      <CreateBotFieldDialog
        folderId={folderId}
        onSuccess={() => {
          router.refresh()
        }}
        workspaceId={workspaceId}
      />
    </>
  )
}
