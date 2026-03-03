import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { CreateAccountFieldDialog } from "./create-account-field-dialog"
import { DeleteAccountFieldsDialog } from "./delete-account-fields-dialog"
import type { AccountFieldResource } from "./schemas/resource"

export function AccountFieldToolbarActions({
  chatbotId,
  folderId,
  table,
}: {
  chatbotId: string
  folderId: string | null
  table: Table<AccountFieldResource>
}) {
  const router = useRouter()

  return (
    <>
      {table.getFilteredSelectedRowModel().rows.length > 0 ? (
        <DeleteAccountFieldsDialog
          chatbotId={chatbotId}
          onSuccess={() => {
            router.refresh()
          }}
          records={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
        />
      ) : null}

      <CreateAccountFieldDialog
        chatbotId={chatbotId}
        folderId={folderId}
        onSuccess={() => {
          router.refresh()
        }}
      />
    </>
  )
}
