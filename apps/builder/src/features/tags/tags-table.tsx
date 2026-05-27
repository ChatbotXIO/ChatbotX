"use client"

import type { TagModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { useLocale, useTranslations } from "next-intl"
import React, { useMemo } from "react"
import { toast } from "sonner"
import { useCopyToClipboard } from "usehooks-ts"
import { DeleteTagsDialog } from "./delete-tag-dialog"
import type { listTags } from "./queries"
import { TagFormDialog } from "./tag-form-dialog"
import { getTagColumns } from "./tags-table-columns"
import { TagsTableToolbarActions } from "./tags-table-toolbar-actions"

type TagsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listTags>>]>
  workspaceId: string
  folderId: string | null
}

export function TagsTable({ promises, workspaceId, folderId }: TagsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] = React.useState<DataTableRowAction<
    TagModel & { contactsCount?: number | null }
  > | null>(null)
  const [_, copy] = useCopyToClipboard()
  const t = useTranslations()
  const locale = useLocale()

  const handleCopy = (id: string) => {
    copy(id)
      .then(() => {
        toast.success("Copiado para a área de transferência!")
      })
      .catch(() => {
        toast.error("Falha ao copiar!")
      })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to memoize the columns
  const columns = useMemo(
    () => getTagColumns({ setRowAction, handleCopy, t, locale }),
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

  // Header de página pixel-perfect Respond.io (Camada 2 — Dados Mestres):
  // título "Etiquetas" + subtítulo curto. Mantém UI flat (sem Card wrapper)
  // conforme regra Pedro 2026-05-23 — só adiciona heading porque agora vive
  // em /settings/* (precisa identificar a seção pro usuário).
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">
          {t("tags.title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("tags.subtitle")}</p>
      </header>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <TagsTableToolbarActions table={table} workspaceId={workspaceId} />
          <TagFormDialog folderId={folderId} workspaceId={workspaceId} />
        </DataTableToolbar>
      </DataTable>

      <DeleteTagsDialog
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
        tags={rowAction?.row.original ? [rowAction?.row.original] : []}
        workspaceId={workspaceId}
      />

      <TagFormDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
        tag={rowAction?.row.original || null}
        workspaceId={workspaceId}
      />
      {/* ChangeFolderDialog removido — Pedro tirou pastas de /tags 2026-05-23 */}
    </div>
  )
}
