"use client"

import type { TemplateListItem } from "@chatbotx.io/business"
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
import {
  MoreHorizontalIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { formatDateTime } from "../lib/format-date-time"
import { DeleteTemplateDialog } from "./delete-template-dialog"
import { ShareTemplateDialog } from "./share-template-dialog"
import { TemplateInstallersDialog } from "./template-installers-dialog"

type TemplatesTableProps = {
  workspaceId: string
  templates: TemplateListItem[]
}

export function TemplatesTable({
  workspaceId,
  templates,
}: TemplatesTableProps) {
  const t = useTranslations()
  const router = useRouter()
  const [deletingTemplate, setDeletingTemplate] =
    useState<TemplateListItem | null>(null)
  const [sharingTemplate, setSharingTemplate] =
    useState<TemplateListItem | null>(null)
  const [installersTemplate, setInstallersTemplate] =
    useState<TemplateListItem | null>(null)

  const columns = useMemo<ColumnDef<TemplateListItem>[]>(
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
          <Link
            className="block truncate font-medium hover:underline"
            href={`/space/${workspaceId}/templates/${row.original.id}/edit`}
          >
            {row.original.name}
          </Link>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "shareStatus",
        size: 140,
        header: () => (
          <div className="text-center">{t("templates.share.label")}</div>
        ),
        cell: ({ row }) => (
          <div className="text-center">
            <Badge
              variant={row.original.shareEnabled ? "default" : "secondary"}
            >
              {row.original.shareEnabled
                ? t("templates.share.enabled")
                : t("templates.share.disabled")}
            </Badge>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "installCount",
        size: 120,
        header: () => (
          <div className="text-center">{t("templates.installs.title")}</div>
        ),
        cell: ({ row }) => (
          <div className="text-center">
            <Button
              aria-label={t("templates.installers.title")}
              className="h-auto p-0 font-normal text-foreground tabular-nums"
              onClick={() => setInstallersTemplate(row.original)}
              variant="link"
            >
              {row.original.installCount}
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "categoryCounts",
        size: 160,
        header: () => (
          <div className="text-center">{t("templates.form.contents")}</div>
        ),
        cell: ({ row }) => {
          const total = Object.values(row.original.categoryCounts).reduce(
            (sum, count) => sum + count,
            0,
          )
          return <div className="text-center tabular-nums">{total}</div>
        },
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
        cell: ({ row }) => formatDateTime(row.original.createdAt),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "action",
        size: 10,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="" />
        ),
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="icon" variant="ghost">
                    <MoreHorizontalIcon className="h-4 w-4" />
                    <span className="sr-only">{t("actions.openMenu")}</span>
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-auto">
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
                <DropdownMenuItem
                  onClick={() => setInstallersTemplate(row.original)}
                >
                  <UsersIcon />
                  {t("templates.installers.title")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSharingTemplate(row.original)}
                >
                  <Share2Icon />
                  {t("templates.share.label")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDeletingTemplate(row.original)}
                  variant="destructive"
                >
                  <Trash2Icon />
                  {t("actions.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, router, workspaceId],
  )

  const { table } = useDataTable({
    data: templates,
    columns,
    pageCount: 1,
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
      <ShareTemplateDialog
        onOpenChange={(open) => {
          if (!open) {
            setSharingTemplate(null)
          }
        }}
        open={Boolean(sharingTemplate)}
        template={sharingTemplate}
        workspaceId={workspaceId}
      />
      <TemplateInstallersDialog
        onOpenChange={(open) => {
          if (!open) {
            setInstallersTemplate(null)
          }
        }}
        open={Boolean(installersTemplate)}
        template={installersTemplate}
        workspaceId={workspaceId}
      />
    </>
  )
}
