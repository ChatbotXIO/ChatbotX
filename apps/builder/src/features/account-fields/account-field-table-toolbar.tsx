import type { Table } from "@tanstack/react-table"
import { DeleteAccountFieldsDialog } from "./delete-account-fields-dialog"
import type { AccountFieldResource } from "./schemas/types"
import { CreateAccountFieldDialog } from "./create-account-field-dialog"

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
          records={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          chatbotId={chatbotId}
        />
      ) : null}

      <CreateAccountFieldDialog chatbotId={chatbotId} />
    </>
  )
}
