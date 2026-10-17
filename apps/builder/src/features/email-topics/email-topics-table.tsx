"use client"

import type { EmailTopicModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableSkeleton } from "@chatbotx.io/ui/components/data-table/data-table-skeleton"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import { useTranslations } from "next-intl"
import React, { Suspense, useMemo } from "react"
import { FolderBarSlot } from "@/features/folders/folder-bar-slot"
import { ChangeFolderDialog } from "../folders/change-folder"
import { CreateEmailTopicDialog } from "./create-email-topic-dialog"
import { DeleteEmailTopicsDialog } from "./delete-email-topic-dialog"
import { getEmailTopicColumns } from "./email-topics-table-columns"
import { EmailTopicsTableToolbarActions } from "./email-topics-table-toolbar-actions"
import type { listEmailTopicsRSC } from "./queries"
import { UpdateEmailTopicDialog } from "./update-email-topic-dialog"

type EmailTopicsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listEmailTopicsRSC>>]>
  workspaceId: string
  folderId: string | null
}

function EmailTopicsTableContent({
  promises,
  workspaceId,
  folderId,
}: EmailTopicsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    React.useState<DataTableRowAction<EmailTopicModel> | null>(null)
  const t = useTranslations()

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to memoize the columns
  const columns = useMemo(() => getEmailTopicColumns({ setRowAction, t }), [])

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
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <EmailTopicsTableToolbarActions
            table={table}
            workspaceId={workspaceId}
          />
          <CreateEmailTopicDialog
            folderId={folderId}
            workspaceId={workspaceId}
          />
        </DataTableToolbar>
      </DataTable>

      <DeleteEmailTopicsDialog
        emailTopics={rowAction?.row.original ? [rowAction.row.original] : []}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
        workspaceId={workspaceId}
      />

      <UpdateEmailTopicDialog
        emailTopic={rowAction?.row.original ?? null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
        workspaceId={workspaceId}
      />

      <ChangeFolderDialog
        currentFolderId={rowAction?.row.original?.folderId ?? null}
        folderType="emailTopic"
        modelIds={rowAction?.row.original ? [rowAction.row.original.id] : null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "move"}
        workspaceId={workspaceId}
      />
    </>
  )
}

export function EmailTopicsTable(props: EmailTopicsTableProps) {
  const t = useTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("emailTopics.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FolderBarSlot />
        <Suspense fallback={<DataTableSkeleton columnCount={4} />}>
          <EmailTopicsTableContent {...props} />
        </Suspense>
      </CardContent>
    </Card>
  )
}
