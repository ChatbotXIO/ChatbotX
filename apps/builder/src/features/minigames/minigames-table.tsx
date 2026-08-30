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
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  HistoryIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import React, { use, useMemo } from "react"
import { EnabledSwitchCell } from "@/components/data-table/enabled-switch-cell"
import { enableMinigameAction } from "./actions/enable-minigame.action"
import { MINIGAME_TYPE_CONFIGS } from "./constants"
import { DeleteMinigamesDialog } from "./delete-minigames"
import { MinigamesTableToolbarActions } from "./minigames-table-toolbar-actions"
import type { ListMinigamesResponse } from "./schema/query"
import type { MinigameResource } from "./schema/resource"

type MinigamesTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ListMinigamesResponse>]>
}

function MinigameTypeLabel({
  type,
  editHref,
}: {
  type: MinigameResource["type"]
  editHref: string
}) {
  const t = useTranslations()
  const config = MINIGAME_TYPE_CONFIGS.find((item) => item.type === type)

  if (!config) {
    return <span className="text-muted-foreground">-</span>
  }

  const Icon = config.icon

  return (
    <Link className="flex w-fit items-center gap-2" href={editHref}>
      <Icon className="size-4 text-muted-foreground" />
      <span>{t(config.labelKey)}</span>
    </Link>
  )
}

export function MinigamesTable({ workspaceId, promises }: MinigamesTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const locale = useLocale()
  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<MinigameResource> | null>(null)

  const columns = useMemo<ColumnDef<MinigameResource>[]>(
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
        id: "type",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <MinigameTypeLabel
            editHref={`/space/${workspaceId}/minigames/${row.original.id}/edit`}
            type={row.original.type}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 30,
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
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="w-fit max-w-50 truncate">
                  <Link
                    href={`/space/${workspaceId}/minigames/${row.original.id}/edit`}
                  >
                    <div className="w-fit max-w-50 truncate">
                      {row.original.name}
                    </div>
                  </Link>
                </div>
              }
            />
            <TooltipContent>
              <p>{row.original.name}</p>
            </TooltipContent>
          </Tooltip>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
      },
      {
        id: "enabled",
        accessorKey: "enabled",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ cell, row }) => (
          <MinigameEnabledCell
            checked={cell.getValue<MinigameResource["enabled"]>()}
            id={row.original.id}
            workspaceId={workspaceId}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        meta: {
          label: t("fields.status.label"),
        },
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
          <span>{formatDate(row.original.createdAt, { locale })}</span>
        ),
        enableSorting: true,
      },
      {
        id: "action",
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
                  <span className="sr-only">{t("actions.openMenu")}</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  router.push(
                    `/space/${workspaceId}/minigames/${row.original.id}/edit`,
                  )
                }
              >
                <PencilIcon />
                {t("actions.edit")}
              </DropdownMenuItem>

              <DropdownMenuItem
                render={
                  <Link
                    href={`/space/${workspaceId}/minigames/${row.original.id}/history`}
                  >
                    <HistoryIcon />
                    {t("minigames.history.title")}
                  </Link>
                }
              />

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
    [t, router, workspaceId, locale],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      columnPinning: { right: ["action"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("minigames.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <MinigamesTableToolbarActions
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteMinigamesDialog
          minigames={rowAction?.row.original ? [rowAction.row.original] : []}
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          showTrigger={false}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}

function MinigameEnabledCell(props: {
  id: string
  workspaceId: string
  checked: boolean
}) {
  const action = useMemo(
    () => enableMinigameAction.bind(null, props.workspaceId, props.id),
    [props.workspaceId, props.id],
  )

  return <EnabledSwitchCell action={action} checked={props.checked} />
}
