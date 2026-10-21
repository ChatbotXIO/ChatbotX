"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import type { ColumnDef } from "@tanstack/react-table"
import type { useTranslations } from "next-intl"
import { getAuditColumns } from "@/enterprise/features/audit-logs/audit-logs-table-columns"
import type { PlatformAuditLogResource } from "./schema"

type TranslationFn = ReturnType<typeof useTranslations>

export function getPlatformAuditColumns(
  t: TranslationFn,
): ColumnDef<PlatformAuditLogResource>[] {
  return [
    {
      id: "workspace",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.workspace.label")}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => row.original.workspace?.name ?? "—",
    },
    ...getAuditColumns<PlatformAuditLogResource>(t),
  ]
}
