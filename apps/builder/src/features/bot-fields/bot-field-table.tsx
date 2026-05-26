"use client"

import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  FingerprintIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TextIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { useCopyToClipboard } from "usehooks-ts"
import CustomFieldTypeLabel from "../custom-fields/components/custom-field-label"
import { BotFieldToolbarActions } from "./bot-field-table-toolbar"
import { DeleteBotFieldsDialog } from "./delete-bot-fields-dialog"
import type { BotFieldResource } from "./schemas/resource"
import { UpdateBotFieldDialog } from "./update-bot-field-dialog"

type FieldsTableProps = {
  workspaceId: string
  folderId: string | null
  promises: Promise<[{ data: BotFieldResource[]; pageCount: number }]>
}

// Formata datas no padrão Respond.io ("abr 21, 2026"). Função pura no
// top-level pra não invalidar o useMemo das columns a cada render.
function formatRespondDate(
  value: Date | string | null,
  locale: string,
): string {
  if (!value) {
    return "—"
  }
  const d = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(d.getTime())) {
    return "—"
  }
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(d)
}

export function BotFieldsTable({
  workspaceId,
  folderId,
  promises,
}: FieldsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const router = useRouter()
  const locale = useLocale()

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<BotFieldResource> | null>(null)
  const [_, copyToClipboard] = useCopyToClipboard()
  const t = useTranslations()

  const columns = useMemo<ColumnDef<BotFieldResource>[]>(
    () => [
      {
        id: "select",
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label="Selecionar todos"
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
            aria-label="Selecionar linha"
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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[200px] truncate font-medium">
                {row.original.name}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.name}</p>
            </TooltipContent>
          </Tooltip>
        ),
        enableSorting: true,
        enableHiding: false,
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
          icon: TextIcon,
        },
        enableColumnFilter: true,
      },
      {
        id: "fieldId",
        accessorKey: "id",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.fieldId.label")}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-muted-foreground text-xs">
                {row.original.id}
              </code>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.id}</p>
            </TooltipContent>
          </Tooltip>
        ),
        size: 140,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "description",
        accessorKey: "description",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.description.label")}
          />
        ),
        cell: ({ row }) => {
          const description = row.original.description
          if (!description) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-[200px] truncate text-muted-foreground text-sm">
                  {description}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{description}</p>
              </TooltipContent>
            </Tooltip>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "type",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.type.label")}
          />
        ),
        cell: ({ row }) => (
          <CustomFieldTypeLabel type={row.original.type as CustomFieldType} />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "value",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.value.label")}
          />
        ),
        cell: ({ row }) => {
          if (!row.original.value) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-[200px] truncate">
                  {row.original.value}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{row.original.value}</p>
              </TooltipContent>
            </Tooltip>
          )
        },
        enableHiding: false,
        enableSorting: false,
      },
      {
        id: "addedAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.addedAt.label")}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatRespondDate(row.original.createdAt, locale)}
          </span>
        ),
        size: 140,
        enableSorting: true,
      },
      {
        id: "actions",
        header: t("actions.actions"),
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">Abrir menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "update" })}
              >
                <PencilIcon />
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => copyToClipboard(row.original.id)}
              >
                <FingerprintIcon />
                {t("actions.getID")}
              </DropdownMenuItem>
              <Separator className="my-1" />
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
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [copyToClipboard, t, locale],
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

  // Header pixel-perfect Respond.io (Camada 2 — Dados Mestres). UI flat sem
  // Card wrapper (regra Pedro 2026-05-23).
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("botFields.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("botFields.subtitle")}
        </p>
      </header>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <BotFieldToolbarActions
            folderId={folderId}
            table={table}
            workspaceId={workspaceId}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteBotFieldsDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          rowAction?.row.toggleSelected(false)
          router.refresh()
        }}
        open={rowAction?.variant === "delete"}
        records={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        workspaceId={workspaceId}
      />

      <UpdateBotFieldDialog
        botField={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => {
          router.refresh()
        }}
        open={rowAction?.variant === "update"}
        workspaceId={workspaceId}
      />
    </div>
  )
}
