"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { Badge } from "@aha.chat/ui/components/ui/badge"
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
import { format } from "date-fns"
import {
  DownloadIcon,
  EyeIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import prettyBytes from "pretty-bytes"
import { use, useMemo, useState } from "react"
import { AIFileProcessingStatus } from "./ai-file-processing-status"
import { AIFilesCreate } from "./ai-files-create"
import { DeleteAIFileDialog } from "./delete-ai-file-dialog"
import type { listAIFiles } from "./queries"
import type { AIFileWithProcessing } from "./schemas"

type AIFilesTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listAIFiles>>]>
}

function RowActionCell({ aiFile }: { aiFile: AIFileWithProcessing }) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost">
            <MoreHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">{t("actions.openMenu")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={aiFile.url} rel="noopener" target="_blank">
              <EyeIcon className="mr-2 h-4 w-4" />
              {t("actions.view")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={aiFile.url} rel="noopener" target="_blank">
              <DownloadIcon className="mr-2 h-4 w-4" />
              {t("actions.download")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setOpen(true)}
          >
            <Trash2Icon className="mr-2 h-4 w-4" />
            {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteAIFileDialog
        aiFile={aiFile}
        onSuccess={() => {
          router.refresh()
        }}
        open={open}
        setOpen={setOpen}
        showTrigger={false}
      />
    </>
  )
}

export default function AIFilesTable({ promises }: AIFilesTableProps) {
  const [{ data }] = use(promises)

  const router = useRouter()
  const t = useTranslations()

  const columns = useMemo<ColumnDef<AIFileWithProcessing>[]>(
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
          <span className="font-medium">{row.original.name}</span>
        ),
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "fileType",
        accessorKey: "fileType",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.type.label")}
          />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.mimeType}</Badge>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: "size",
        accessorKey: "size",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.size.label")}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {prettyBytes(row.original.size)}
          </span>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: "processingStatus",
        accessorKey: "processingStatus",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.processingStatus.label")}
          />
        ),
        cell: ({ row }) => (
          <AIFileProcessingStatus
            aiFileId={row.original.id}
            chunksCount={row.original.chunksCount}
            processingStatus={row.original.processingStatus}
          />
        ),
        enableSorting: false,
        enableHiding: true,
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
          <span className="text-muted-foreground">
            {format(row.original.createdAt, "MMM dd, yyyy")}
          </span>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: "actions",
        header: t("actions.actions"),
        cell: ({ row }) => <RowActionCell aiFile={row.original} />,
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
          <h3 className="font-semibold text-lg">{t("aiFiles.title")}</h3>
          <p className="text-muted-foreground text-sm">
            {t("aiFiles.description")}
          </p>
        </div>
        <AIFilesCreate
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
