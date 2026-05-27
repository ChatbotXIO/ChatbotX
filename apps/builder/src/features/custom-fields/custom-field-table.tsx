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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import CustomFieldTypeLabel from "./components/custom-field-label"
import { CustomizeContactFieldsDialog } from "./components/customize-contact-fields-dialog"
import { DefaultFieldsList } from "./components/default-fields-list"
import { CreateCustomFieldDialog } from "./create-custom-field"
import { CustomFieldsTableToolbarActions } from "./custom-field-table-toolbar-actions"
import { DeleteFieldsDialog } from "./delete-fields-dialog"
import type { listCustomFieldsRSC } from "./queries"
import type { CustomFieldResource } from "./schemas/resource"
import { UpdateCustomFieldDialog } from "./update-custom-field-dialog"

// Map visibility 3-state → i18n key. Top-level pra evitar nested ternary
// e não invalidar useMemo das columns a cada render.
const VISIBILITY_LABEL_KEY: Record<string, string> = {
  alwaysShow: "fields.visibility.alwaysShow",
  alwaysHide: "fields.visibility.alwaysHide",
  hideWhenEmpty: "fields.visibility.hideWhenEmpty",
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

type FieldsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listCustomFieldsRSC>>]>
  workspaceId: string
  folderId: string | null
  initialHiddenKeys: string[]
  /** Lista completa (não paginada) pra alimentar o dialog Personalizar visualização. */
  allCustomFields: CustomFieldResource[]
}

export function CustomFieldsTable({
  promises,
  workspaceId,
  folderId,
  initialHiddenKeys,
  allCustomFields,
}: FieldsTableProps) {
  const t = useTranslations()
  const locale = useLocale()
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<CustomFieldResource> | null>(null)

  const columns = useMemo<ColumnDef<CustomFieldResource>[]>(
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
          <div>
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
          </div>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: true,
        enableHiding: false,
      },
      {
        // "ID do campo" — slug user-facing imutável (gap #11 — 2026-05-27).
        // Usado em APIs/integrações/variáveis de template; muito mais
        // legível que o Snowflake `id` interno.
        id: "fieldId",
        accessorKey: "fieldId",
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
                {row.original.fieldId}
              </code>
            </TooltipTrigger>
            <TooltipContent>
              <p>{row.original.fieldId}</p>
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
        cell: ({ row }) => (
          <div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-[200px] truncate">
                  {row.original.description}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{row.original.description}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "Type",
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
        meta: {
          label: t("fields.type.label"),
        },
        size: 100,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "visibility",
        accessorKey: "visibility",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.visibility.label")}
          />
        ),
        // Visibilidade 3-state Respond.io: alwaysShow / alwaysHide /
        // hideWhenEmpty. Schema migrou de boolean showInInbox em 2026-05-27.
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {t(
              VISIBILITY_LABEL_KEY[row.original.visibility] ??
                "fields.visibility.alwaysShow",
            )}
          </span>
        ),
        enableSorting: false,
        enableHiding: false,
        meta: {
          label: t("fields.visibility.label"),
        },
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
        meta: {
          label: t("fields.addedAt.label"),
        },
      },
      {
        id: "actions",
        header: "Ações",
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
              {/* Item "Mover" (folder) removido — Pedro tirou pastas de /custom-fields */}
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
    [t, locale],
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

  // Header de página pixel-perfect Respond.io (Camada 2 — Dados Mestres).
  // UI flat (sem Card wrapper) — heading só identifica a seção em /settings/.
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("customFields.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("customFields.subtitle")}
        </p>
      </header>
      <DefaultFieldsList />
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <CustomFieldsTableToolbarActions
            table={table}
            workspaceId={workspaceId}
          />
          <CustomizeContactFieldsDialog
            customFields={allCustomFields}
            initialHiddenKeys={initialHiddenKeys}
            workspaceId={workspaceId}
          />
          <CreateCustomFieldDialog
            folderId={folderId}
            workspaceId={workspaceId}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteFieldsDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        records={rowAction?.row.original ? [rowAction?.row.original] : []}
        showTrigger={false}
        workspaceId={workspaceId}
      />

      <UpdateCustomFieldDialog
        customField={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
        workspaceId={workspaceId}
      />
      {/* ChangeFolderDialog removido — Pedro tirou pastas de /custom-fields 2026-05-23 */}
    </div>
  )
}
