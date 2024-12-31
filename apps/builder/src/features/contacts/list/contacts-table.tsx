"use client"

import * as React from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';
import { Contact } from '@prisma/client';

import { getColumns } from './contacts-table-columns';
import { getContacts } from './get-contacts-queries';

import type {
  DataTableFilterField,
  DataTableRowAction
} from "@/components/data-table/types"

interface ContactsTableProps {
  promises: Promise<[
    Awaited<ReturnType<typeof getContacts>>,
  ]>
}

export function ContactsTable({ promises }: ContactsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [, setRowAction] = React.useState<DataTableRowAction<Contact> | null>(null)

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
      <DataTable table={table} >
        <DataTableToolbar table={table} filterFields={filterFields} />
      </DataTable>
    </>
  )
}
