"use client";

import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import type {
  DataTableFilterField,
  DataTableRowAction,
} from "@/components/data-table/types";
import { useDataTable } from "@/hooks/use-data-table";
import React from 'react';
import { getTags } from "./queries";
import { Tag } from "@ahachat.ai/database";
import { getTagColumns } from "./tags-table-columns";

interface TagsTableProps {
  promises: Promise<[
    Awaited<ReturnType<typeof getTags>>
  ]>;
  chatbotId: string
}

export function TagsTable({ promises, chatbotId }: TagsTableProps) {
  const [{ data, pageCount }] = React.use(promises);
  const [rowAction, setRowAction] = React.useState<DataTableRowAction<Tag> | null>(null);

  const columns = React.useMemo(
    () => getTagColumns(),
    [setRowAction]
  )

  const filterFields: DataTableFilterField<Tag & { name?: string }>[] = [
    {
      id: "name",
      label: "Search",
      placeholder: "Enter tags name...",
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
        </DataTableToolbar>
      </DataTable>
    </>
  );
}
