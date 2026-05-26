"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
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
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  EllipsisVerticalIcon,
  FingerprintIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"
import type { SavedReplyResource } from "./schema/resource"

type GetColumnsProps = {
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<SavedReplyResource> | null>
  >
  handleCopy: (id: string) => void
  t: ReturnType<typeof useTranslations>
  locale: string
}

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
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d)
}

export function getSnippetColumns({
  setRowAction,
  handleCopy,
  t,
  locale,
}: GetColumnsProps): ColumnDef<SavedReplyResource>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar todos"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          className="translate-y-0.5"
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(Boolean(value))
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Selecionar linha"
          checked={row.getIsSelected()}
          className="translate-y-0.5"
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        />
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      // `shortcut` no schema atual cumpre o duplo papel de nome + ID estável
      // do snippet (usado pelo composer com "/shortcut" autocomplete).
      id: "shortcut",
      accessorKey: "shortcut",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("snippets.nameLabel")}
        />
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="max-w-[200px] truncate font-medium">
              {row.original.shortcut}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{row.original.shortcut}</p>
          </TooltipContent>
        </Tooltip>
      ),
      meta: {
        label: t("snippets.nameLabel"),
        placeholder: t("snippets.searchPlaceholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: true,
      enableHiding: false,
    },
    {
      id: "text",
      accessorKey: "text",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("snippets.messageLabel")}
        />
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="max-w-[420px] truncate text-muted-foreground text-sm">
              {row.original.text}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-md">
            <p className="whitespace-pre-wrap">{row.original.text}</p>
          </TooltipContent>
        </Tooltip>
      ),
      enableSorting: false,
    },
    {
      id: "createdAt",
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
      size: 180,
      enableSorting: true,
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.lastEditedAt.label")}
        />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatRespondDate(row.original.updatedAt, locale)}
        </span>
      ),
      size: 180,
      enableSorting: true,
    },
    {
      id: "actions",
      header: t("actions.actions"),
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Abrir menu"
              className="flex size-8 p-0 data-[state=open]:bg-muted"
              variant="ghost"
            >
              <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "update" })}
            >
              <PencilIcon />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleCopy(`${row.original.id}`)}>
              <FingerprintIcon />
              {t("actions.getID")}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => setRowAction({ row, variant: "delete" })}
            >
              <Trash2Icon className="text-destructive" />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
