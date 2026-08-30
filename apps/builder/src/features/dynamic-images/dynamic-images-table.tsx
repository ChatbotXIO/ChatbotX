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
import { getPublicFileUrl } from "@chatbotx.io/utils"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import React, { use, useMemo } from "react"
import { EnabledSwitchCell } from "@/components/data-table/enabled-switch-cell"
import { useTenantSettings } from "@/features/tenant"
import { enableDynamicImageAction } from "./actions/enable-dynamic-image.action"
import { DeleteDynamicImagesDialog } from "./delete-dynamic-images"
import { DynamicImagesTableToolbarActions } from "./dynamic-images-table-toolbar-actions"
import type { ListDynamicImagesResponse } from "./schemas/query"
import type { DynamicImageResource } from "./schemas/resource"

type DynamicImagesTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ListDynamicImagesResponse>]>
}

function BackgroundPreview({
  backgroundUrl,
  editHref,
  name,
}: {
  backgroundUrl: string | null
  editHref: string
  name: string
}) {
  const { storageUrl } = useTenantSettings()

  if (!backgroundUrl) {
    return <span className="text-muted-foreground">-</span>
  }

  return (
    <Link href={editHref}>
      {/* biome-ignore lint/performance/noImgElement: previewing a workspace-owned rendered background, not an optimizable static asset */}
      <img
        alt={name}
        className="h-10 w-16 rounded object-cover"
        height={40}
        src={getPublicFileUrl(backgroundUrl, storageUrl)}
        width={64}
      />
    </Link>
  )
}

export function DynamicImagesTable({
  workspaceId,
  promises,
}: DynamicImagesTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const locale = useLocale()
  const [{ data, pageCount }] = use(promises)

  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<DynamicImageResource> | null>(null)

  const columns = useMemo<ColumnDef<DynamicImageResource>[]>(
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
        id: "preview",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <BackgroundPreview
            backgroundUrl={row.original.backgroundUrl}
            editHref={`/space/${workspaceId}/dynamic-images/${row.original.id}/edit`}
            name={row.original.name}
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
                    href={`/space/${workspaceId}/dynamic-images/${row.original.id}/edit`}
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
          <DynamicImageEnabledCell
            checked={cell.getValue<DynamicImageResource["enabled"]>()}
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
                    `/space/${workspaceId}/dynamic-images/${row.original.id}/edit`,
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
          {t("dynamicImages.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <DynamicImagesTableToolbarActions
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteDynamicImagesDialog
          dynamicImages={
            rowAction?.row.original ? [rowAction.row.original] : []
          }
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          showTrigger={false}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}

function DynamicImageEnabledCell(props: {
  id: string
  workspaceId: string
  checked: boolean
}) {
  const action = useMemo(
    () => enableDynamicImageAction.bind(null, props.workspaceId, props.id),
    [props.workspaceId, props.id],
  )

  return <EnabledSwitchCell action={action} checked={props.checked} />
}
