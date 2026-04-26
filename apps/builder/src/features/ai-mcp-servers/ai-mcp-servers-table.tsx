"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { deleteAIMcpServerAction } from "./actions/delete-ai-mcp-server.action"
import { AIMcpServersCreate } from "./ai-mcp-servers-create"
import type { listAIMcpServers } from "./queries"
import type { AIMcpServerResource } from "./schema/resource"

type AIMcpServersTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listAIMcpServers>>]>
}

export default function AIMcpServersTable({
  workspaceId,
  promises,
}: AIMcpServersTableProps) {
  const [{ data }] = use(promises)

  const t = useTranslations()
  const router = useRouter()
  const [rowAction, setRowAction] = useState<AIMcpServerResource | null>(null)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<AIMcpServerResource | null>(
    null,
  )
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    if (!selectedRow) {
      return
    }

    startTransition(async () => {
      const result = await deleteAIMcpServerAction(workspaceId, selectedRow.id)
      if (result?.serverError) {
        toast.error(result.serverError)
      } else {
        toast.success(
          t("messages.deletedSuccess", {
            feature: t("fields.mcpServer.label"),
          }),
        )
        setIsDeleteOpen(false)
        router.refresh()
      }
    })
  }

  const columns = useMemo<ColumnDef<AIMcpServerResource>[]>(
    () => [
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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[300px] truncate">{row.original.name}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.name}</p>
            </TooltipContent>
          </Tooltip>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[400px] truncate">{row.original.url}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.url}</p>
            </TooltipContent>
          </Tooltip>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "actions",
        header: t("actions.actions"),
        cell: ({ row }) => (
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
                  setRowAction(row.original)
                }}
              >
                <PencilIcon className="mr-2 h-4 w-4" />
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  setSelectedRow(row.original)
                  setIsDeleteOpen(true)
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
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("aiMcpServers.title")}
        </CardTitle>
        <CardDescription>{t("aiMcpServers.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <AIMcpServersCreate
              onSuccess={() => {
                router.refresh()
              }}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <AIMcpServersCreate
          initialData={rowAction ?? undefined}
          mode="edit"
          onOpenChange={(open) => !open && setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={!!rowAction}
          workspaceId={workspaceId}
        />

        <AlertDialog onOpenChange={setIsDeleteOpen} open={isDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("messages.deleteFeature", {
                  feature: t("fields.mcpServer.label"),
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("messages.deleteConfirmation", {
                  feature: t("fields.mcpServer.label"),
                  name: selectedRow?.name ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction disabled={isPending} onClick={handleDelete}>
                {isPending && (
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("actions.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
