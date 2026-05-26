"use client"

import type { TagModel } from "@chatbotx.io/database/types"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
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

import { getTagChipStyle } from "./tag-colors"

type TagWithContacts = TagModel & {
  contactsCount?: number
}

type GetColumnsProps = {
  setRowAction: Dispatch<SetStateAction<DataTableRowAction<TagModel> | null>>
  handleCopy: (id: string) => void
  t: ReturnType<typeof useTranslations>
  locale: string
}

// Formata datas no padrão Respond.io pt-BR: "abr 21, 2026 12:19 PM".
// Locale dinâmico — passa "en"/"vi" e respeita.
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

export function getTagColumns({
  setRowAction,
  handleCopy,
  t,
  locale,
}: GetColumnsProps): ColumnDef<TagWithContacts>[] {
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
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.name.label")} />
      ),
      cell: ({ row }) => {
        const { name, color, emoji } = row.original
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                // Chip estilo Respond.io adaptado (Pedro 2026-05-26):
                // radius 4px (regra "quadriculado com pontinhas arredondadas"),
                // padding 4×8, font 12px/16px weight 600, outline 1px sutil
                // (L=24% só 6pts acima do bg) + bg escuro + text claro pastel.
                className="inline-flex max-w-[280px] items-center gap-1 truncate rounded px-2 py-1 font-semibold text-xs leading-4"
                style={getTagChipStyle(color)}
              >
                {emoji ? <span aria-hidden>{emoji}</span> : null}
                <span className="truncate">{name}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{name}</p>
            </TooltipContent>
          </Tooltip>
        )
      },
      size: 300,
      meta: {
        label: t("fields.name.label"),
        placeholder: t("fields.name.placeholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: "description",
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("tags.descriptionLabel")}
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
              <div className="max-w-[280px] truncate text-muted-foreground text-sm">
                {description}
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>{description}</p>
            </TooltipContent>
          </Tooltip>
        )
      },
      size: 280,
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
      meta: {
        label: t("fields.addedAt.label"),
      },
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
      meta: {
        label: t("fields.lastEditedAt.label"),
      },
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
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
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
