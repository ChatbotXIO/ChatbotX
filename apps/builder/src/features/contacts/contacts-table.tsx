"use client"

import * as React from "react"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { useDataTable } from "@/hooks/use-data-table"
import type { Contact, Conversation } from "@ahachat.ai/database"

import { getColumns } from "./contacts-table-columns"
import type { getContacts } from "./queries"

import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types"
import { ContactListAction } from "@/features/contacts/contact-list-action"
import type { getTeams } from "@/features/teams/queries"
import type { getUsers } from "@/features/users/queries"

interface ContactsTableProps {
  chatbotId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof getContacts>>,
      Awaited<ReturnType<typeof getUsers>>,
      Awaited<ReturnType<typeof getTeams>>,
    ]
  >
}

export function ContactsTable({ chatbotId, promises }: ContactsTableProps) {
  const [{ data, pageCount }, { data: users }, { data: teams }] =
    React.use(promises)
  const [, setRowAction] = React.useState<DataTableRowAction<
    Contact & { conversation: Conversation | null }
  > | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = React.useMemo(() => getColumns(), [setRowAction])

  const filterFields: DataTableFilterField<Contact & { keyword?: string }>[] = [
    {
      id: "keyword",
      label: "Search",
      placeholder: "Enter keyword...",
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
          <ContactListAction
            chatbotId={chatbotId}
            rows={table.getFilteredSelectedRowModel().rows}
            users={users}
            teams={teams}
            onUnsetAllRows={() => table.toggleAllRowsSelected(false)}
          />
        </DataTableToolbar>
      </DataTable>
    </>
  )
}
