"use client";

import React from "react";
import { getAgents } from "./get-agents-queries";
import { DataTableFilterField, DataTableRowAction } from "@/components/data-table/types";
import { ChatbotMember } from "@prisma/client";
import { getColumns } from "./agents-table-columns";
import { useDataTable } from "@/hooks/use-data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTable } from "@/components/data-table/data-table";


interface AgentsTableProps{
  promises: Promise<[
    Awaited<ReturnType<typeof getAgents>>,
  ]>
}

export function AgentsTable({promises}:AgentsTableProps) {

  const [{data, pageCount}] = React.use(promises);
  console.log("dữ liệu",data)
  const [rowAction, setRowAction] = React.useState<DataTableRowAction<ChatbotMember>|null>(null)

  const columns = React.useMemo(()=>getColumns(), [setRowAction])

    const filterFields: DataTableFilterField<ChatbotMember & { keyword?: string }>[] = [
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

    return(
      <>
      <DataTable table={table}>
        <DataTableToolbar table={table}/>
      </DataTable>
      </>
    )
}
