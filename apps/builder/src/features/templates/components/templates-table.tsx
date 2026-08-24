"use client"

import type { TemplateModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { DeleteTemplateDialog } from "./delete-template-dialog"

type TemplatesTableProps = {
  workspaceId: string
  templates: TemplateModel[]
  isSuperAdmin: boolean
}

export function TemplatesTable({
  workspaceId,
  templates,
  isSuperAdmin,
}: TemplatesTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const [deletingTemplate, setDeletingTemplate] =
    useState<TemplateModel | null>(null)

  const columns = useMemo<ColumnDef<TemplateModel>[]>(
    () => [
      {
        accessorKey: "name",
        size: 260,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="truncate font-medium">{row.original.name}</div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "shareStatus",
        size: 140,
        header: t("templates.share.label"),
        cell: ({ row }) => (
          <Badge variant={row.original.shareEnabled ? "default" : "secondary"}>
            {row.original.shareEnabled
              ? t("templates.share.enabled")
              : t("templates.share.disabled")}
          </Badge>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "installCount",
        size: 120,
        header: t("templates.installs.title"),
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.installCount}</span>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "createdAt",
        size: 150,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd HH:mm"),
        enableSorting: true,
        enableHiding: false,
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
              {isSuperAdmin && (
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/space/${workspaceId}/templates/${row.original.id}/edit`,
                    )
                  }
                >
                  <PencilIcon />
                  {t("actions.edit")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setDeletingTemplate(row.original)}
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
    [t, router, workspaceId, isSuperAdmin],
  )

  const { table } = useDataTable({
    data: templates,
    columns,
    pageCount: 1,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table} />
      <DeleteTemplateDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeletingTemplate(null)
          }
        }}
        open={Boolean(deletingTemplate)}
        templateId={deletingTemplate?.id ?? ""}
        workspaceId={workspaceId}
      />
    </>
  )
}
