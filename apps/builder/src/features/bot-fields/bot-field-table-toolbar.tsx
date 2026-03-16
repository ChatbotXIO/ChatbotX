import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { CreateBotFieldDialog } from "./create-bot-field-dialog"
import { DeleteBotFieldsDialog } from "./delete-bot-fields-dialog"
import type { BotFieldResource } from "./schemas/resource"

export function BotFieldToolbarActions({
  chatbotId,
  folderId,
  table,
}: {
  chatbotId: string
  folderId: string | null
  table: Table<BotFieldResource>
}) {
  const router = useRouter()

  return (
    <>
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteBotFieldsDialog
          chatbotId={chatbotId}
          onSuccess={() => {
            router.refresh()
          }}
          records={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}

      <CreateBotFieldDialog
        chatbotId={chatbotId}
        folderId={folderId}
        onSuccess={() => {
          router.refresh()
        }}
      />
    </>
  )
}
