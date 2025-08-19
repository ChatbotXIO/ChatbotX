import type { Table } from "@tanstack/react-table"
import { CreateAccountFieldDialog } from "./create-account-field-dialog"
import { DeleteAccountFieldsDialog } from "./delete-account-fields-dialog"
import type { AccountFieldResource } from "./schemas/types"

export function AccountFieldToolbarActions({
  chatbotId,
  table,
}: {
  chatbotId: string
  folderId?: string | null
  table: Table<AccountFieldResource>
}) {
  return (
    <>
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAccountFieldsDialog
          chatbotId={chatbotId}
          records={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}

      <CreateAccountFieldDialog chatbotId={chatbotId} />
    </>
  )
}
