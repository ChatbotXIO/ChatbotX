"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { QuestionnaireListItem } from "../schemas/resource"
import { CreateQuestionnaireDialog } from "./create-questionnaire-dialog"
import { DeleteQuestionnairesDialog } from "./delete-questionnaires-dialog"

export function QuestionnairesTableToolbarActions({
  table,
  workspaceId,
}: {
  workspaceId: string
  table: Table<QuestionnaireListItem>
}) {
  const t = useTranslations()
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows

  return (
    <div className="flex items-center gap-2">
      {selectedRows.length > 0 ? (
        <>
          <Button
            onClick={() => setBulkDeleteOpen(true)}
            size="sm"
            variant="outline"
          >
            <Trash2Icon aria-hidden="true" className="me-2 size-4" />
            {t("actions.delete")} ({selectedRows.length})
          </Button>
          <DeleteQuestionnairesDialog
            onOpenChange={setBulkDeleteOpen}
            onSuccess={() => table.toggleAllRowsSelected(false)}
            open={bulkDeleteOpen}
            questionnaires={selectedRows.map((row) => row.original)}
            workspaceId={workspaceId}
          />
        </>
      ) : null}

      <CreateQuestionnaireDialog workspaceId={workspaceId} />
    </div>
  )
}
