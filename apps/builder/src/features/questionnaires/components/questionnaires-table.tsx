"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
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
import { use, useMemo, useState } from "react"
import type { listQuestionnaires } from "../queries"
import type { QuestionnaireListItem } from "../schemas/resource"
import { DeleteQuestionnairesDialog } from "./delete-questionnaires-dialog"
import { DuplicateQuestionnaireDialog } from "./duplicate-questionnaire-dialog"
import { getQuestionnaireColumns } from "./questionnaires-table-columns"
import { QuestionnairesTableToolbarActions } from "./questionnaires-table-toolbar-actions"
import { RenameQuestionnaireDialog } from "./rename-questionnaire-dialog"

type Props = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listQuestionnaires>>]>
}

export function QuestionnairesTable({ workspaceId, promises }: Props) {
  const t = useTranslations()
  const [{ data, pageCount }] = use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<QuestionnaireListItem> | null>(null)
  const columns = useMemo(
    () => getQuestionnaireColumns({ t, setRowAction }),
    [t],
  )
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "name", desc: false }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("questionnaires.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <QuestionnairesTableToolbarActions
              table={table}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>
        <RenameQuestionnaireDialog
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "rename"}
          questionnaire={rowAction?.row.original ?? null}
          workspaceId={workspaceId}
        />
        <DuplicateQuestionnaireDialog
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "duplicate"}
          questionnaire={rowAction?.row.original ?? null}
          workspaceId={workspaceId}
        />
        <DeleteQuestionnairesDialog
          onOpenChange={() => setRowAction(null)}
          open={rowAction?.variant === "delete"}
          questionnaires={
            rowAction?.row.original ? [rowAction.row.original] : []
          }
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
