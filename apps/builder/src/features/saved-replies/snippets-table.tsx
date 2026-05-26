"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { useLocale, useTranslations } from "next-intl"
import React, { useMemo } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { DeleteSnippetDialog } from "./delete-snippet-dialog"
import type { listSnippetsRSC } from "./queries/list-snippets-rsc"
import type { SavedReplyResource } from "./schema/resource"
import { SnippetFormDialog } from "./snippet-form-dialog"
import { getSnippetColumns } from "./snippets-table-columns"

type SnippetsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listSnippetsRSC>>]>
  workspaceId: string
}

export function SnippetsTable({ promises, workspaceId }: SnippetsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<SavedReplyResource> | null>(null)
  const [_, copy] = useCopyToClipboard()
  const t = useTranslations()
  const locale = useLocale()

  const handleCopy = (id: string) => {
    copy(id)
      .then(() => toast.success("Copiado para a área de transferência!"))
      .catch(() => toast.error("Falha ao copiar!"))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: memo
  const columns = useMemo(
    () => getSnippetColumns({ setRowAction, handleCopy, t, locale }),
    [locale],
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("snippets.title")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("snippets.subtitle")}
        </p>
      </header>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <SnippetFormDialog workspaceId={workspaceId} />
        </DataTableToolbar>
      </DataTable>

      <SnippetFormDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
        snippet={rowAction?.row.original ?? null}
        workspaceId={workspaceId}
      />

      <DeleteSnippetDialog
        onOpenChange={(open) => {
          if (!open) {
            setRowAction(null)
          }
        }}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        snippet={rowAction?.row.original ?? null}
        workspaceId={workspaceId}
      />
    </div>
  )
}
