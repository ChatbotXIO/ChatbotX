"use client";

import React from 'react';

import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { useDataTable } from "@/hooks/use-data-table";
import { Field } from "@ahachat.ai/database";
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types";
import { getFields } from './queries';
import { getColumns } from './account-field-table-columns';
import { FieldsTableToolbarActions } from './fields-table-toolbar-actions';

interface FieldsTableProps {
  promises: Promise<[
    Awaited<ReturnType<typeof getFields>>
  ]>;
  chatbotId: string
}

export function AccountFieldsTable({ promises, chatbotId }: FieldsTableProps) {
  const [{ data, pageCount }] = React.use(promises);
  const [rowAction, setRowAction] = React.useState<DataTableRowAction<Field> | null>(null);

  const columns = React.useMemo(
    () => getColumns({ setRowAction }),
    [setRowAction]
  )

  const filterFields: DataTableFilterField<Field & { name?: string }>[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter Field name...",
    },
  ];

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
  });

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} filterFields={filterFields}>
          <FieldsTableToolbarActions table={table} chatbotId={chatbotId} />
        </DataTableToolbar>
      </DataTable>
    </>
  );
}

