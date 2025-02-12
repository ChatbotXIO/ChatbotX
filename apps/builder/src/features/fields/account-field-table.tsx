"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type { DataTableFilterField } from "@/components/data-table/types"
import { useDataTable } from "@/hooks/use-data-table"
import { type Field, FieldType } from "@ahachat.ai/database"
import type { Row } from "@tanstack/react-table"
import { use, useMemo, useState } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { getColumns } from "./account-field-table-columns"
// import { UpdateAccountFieldDialog } from "./account-field/update-account-field-dialog"
import { AccountFieldsTableToolbarActions } from "./account-fields-table-toolbar-actions"
import { DeleteFieldsDialog } from "./delete-fields-dialog"
import type { listFields } from "./queries"

interface FieldsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof listFields>>]>
  chatbotId: string
}

interface DataTableRowAction<TData> {
  row: Row<TData>
  type: "update" | "delete" | "update-name"
}

export function AccountFieldsTable({ promises, chatbotId }: FieldsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] = useState<DataTableRowAction<Field> | null>(
    null,
  )

  const [_, copyFieldId] = useCopyToClipboard()
  const handleCopy = (id: string) => {
    copyFieldId(id)
      .then(() => {
        toast.success("Copied to clipboard!")
      })
      .catch(() => {
        toast.error("Failed to copy!")
      })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(
    () => getColumns({ setRowAction, handleCopy }),
    [setRowAction],
  )

  const filterFields: DataTableFilterField<Field & { name?: string }>[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter Field name...",
    },
  ]

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    filterFields,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <AccountFieldsTableToolbarActions
            table={table}
            chatbotId={chatbotId}
            setRowAction={setRowAction}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteFieldsDialog
        open={rowAction?.type === "delete"}
        onOpenChange={() => setRowAction(null)}
        fields={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        chatbotId={chatbotId}
        fieldType={FieldType.AccountField}
      />

      {/* <UpdateAccountFieldDialog
        open={rowAction?.type === "update"}
        onOpenChange={() => setRowAction(null)}
        chatbotId={chatbotId}
        accountField={rowAction?.row.original || null}
      /> */}
    </>
  )
}
