"use client"

import type { AIFunctionModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import { formatDate } from "@aha.chat/ui/lib/format"
import type { ColumnDef } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { AIFunctionsCreate } from "./ai-functions-create"
import type { listAIFunctions } from "./queries"

type AIFunctionsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listAIFunctions>>]>
}

export default function AIFunctionsTable({ promises }: AIFunctionsTableProps) {
  const [{ data }] = use(promises)
  const t = useTranslations()
  const router = useRouter()

  const columns = useMemo<ColumnDef<AIFunctionModel>[]>(
    () => [
      {
        id: "select",
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              innerTable.getIsAllPageRowsSelected() ||
              (innerTable.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              innerTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
          </div>
        ),
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {formatDate(row.original.createdAt)}
            </span>
          </div>
        ),
        enableSorting: true,
        enableHiding: false,
      },
    ],
    [t],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount: 1,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("aiFunctions.title")}
        </CardTitle>
        <CardDescription>{t("aiFunctions.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <AIFunctionsCreate
              onSuccess={() => {
                router.refresh()
              }}
            />
          </DataTableToolbar>
        </DataTable>
      </CardContent>
    </Card>
  )
}
