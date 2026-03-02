"use client"

import type { AIMCPServerModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { EyeIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { toast } from "sonner"
import { AIMcpServersCreate } from "./ai-mcp-servers-create"
import type { listAIMcpServers } from "./queries"

type AIMcpServersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listAIMcpServers>>]>
}

export default function AIMcpServersTable({
  promises,
}: AIMcpServersTableProps) {
  const [{ data }] = use(promises)

  const t = useTranslations()
  const router = useRouter()
  // const [rowAction, setRowAction] =
  //   useState<DataTableRowAction<AIMCPServerModel> | null>(null)

  const columns = useMemo<ColumnDef<AIMCPServerModel>[]>(
    () => [
      {
        id: "select",
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
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
            aria-label={t("actions.selectRow")}
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
        id: "url",
        accessorKey: "url",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.url.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2 truncate">
            <span className="font-medium">{row.original.url}</span>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "actions",
        header: t("actions.actions"),
        cell: () => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">{t("actions.openMenu")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  toast.info(t("messages.updateFileComingSoon"))
                }}
              >
                <EyeIcon className="mr-2 h-4 w-4" />
                {t("actions.update")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  toast.info(t("messages.deleteFileComingSoon"))
                }}
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        size: 50,
        enableSorting: false,
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
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{t("aiMcpServers.title")}</h3>
          <p className="text-muted-foreground text-sm">
            {t("aiMcpServers.description")}
          </p>
        </div>
        <AIMcpServersCreate
          onSuccess={() => {
            router.refresh()
          }}
        />
      </div>

      <DataTable table={table}>
        {/* <DataTableToolbar table={table} /> */}
      </DataTable>
    </div>
  )
}
