"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
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
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type {
  ListFacebookLeadAdItem,
  ListFacebookLeadAdsResponse,
} from "../schemas/query"
import { DeleteFacebookLeadAdAutomationsDialog } from "./delete-facebook-lead-ad-automations"
import { FacebookLeadAdsTableToolbarActions } from "./facebook-lead-ads-table-toolbar-actions"

type FacebookLeadAdsTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ListFacebookLeadAdsResponse>]>
}

export function FacebookLeadAdsTable({
  workspaceId,
  promises,
}: FacebookLeadAdsTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<ListFacebookLeadAdItem> | null>(null)

  const columns = useMemo<ColumnDef<ListFacebookLeadAdItem>[]>(
    () => [
      {
        id: "select",
        header: ({ table: tableData }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={tableData.getIsAllPageRowsSelected()}
            className="translate-y-0.5"
            indeterminate={tableData.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              tableData.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("actions.selectRow")}
            checked={row.getIsSelected()}
            className="translate-y-0.5"
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 20,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "keyword",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <button
            className="inline-block max-w-[240px] cursor-pointer truncate text-start hover:underline"
            onClick={() =>
              router.push(
                `/space/${workspaceId}/fb-lead-ads/${row.original.id}`,
              )
            }
            type="button"
          >
            {row.original.name}
          </button>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("actions.search"),
          variant: "text",
        },
        enableColumnFilter: true,
      },
      {
        id: "leadsHandledCount",
        accessorKey: "leadsHandledCount",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("facebookLeadAdsAutomation.leads")}
          />
        ),
        cell: ({ row }) => (
          <div className="text-center">{row.original.leadsHandledCount}</div>
        ),
        enableSorting: false,
      },
      {
        id: "flow",
        accessorKey: "flowId",
        header: ({ column }) => (
          <DataTableColumnHeader
            className="w-full justify-center"
            column={column}
            title={t("fields.flow.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="inline-block max-w-[200px] truncate">
                    {row.original.flow?.name ?? "—"}
                  </div>
                }
              />
              <TooltipContent>
                <p>{row.original.flow?.name ?? "—"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: "actions",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon" variant="ghost">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/space/${workspaceId}/fb-lead-ads/${row.original.id}`,
                  )
                }
              >
                <PencilIcon />
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "delete" })}
                variant="destructive"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, router.push, workspaceId],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
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
          {t("facebookLeadAdsAutomation.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <FacebookLeadAdsTableToolbarActions
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteFacebookLeadAdAutomationsDialog
          automations={rowAction?.row.original ? [rowAction.row.original] : []}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => router.refresh()}
          open={rowAction?.variant === "delete"}
          showTrigger={false}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
