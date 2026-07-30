"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import type { Table } from "@tanstack/react-table"
import { Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { DeleteApplicantSubmissionsDialog } from "./delete-applicant-submissions-dialog"

type Submission = { id: string }

export function QuestionnaireApplicantsTableToolbarActions<
  TData extends Submission,
>({
  table,
  workspaceId,
  questionnaireId,
}: {
  table: Table<TData>
  workspaceId: string
  questionnaireId: string
}) {
  const t = useTranslations()
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const selectedRows = table.getFilteredSelectedRowModel().rows

  if (selectedRows.length === 0) {
    return null
  }

  return (
    <>
      <Button
        onClick={() => setBulkDeleteOpen(true)}
        size="sm"
        variant="outline"
      >
        <Trash2Icon aria-hidden="true" className="me-2 size-4" />
        {t("actions.delete")} ({selectedRows.length})
      </Button>
      <DeleteApplicantSubmissionsDialog
        onOpenChange={setBulkDeleteOpen}
        onSuccess={() => table.toggleAllRowsSelected(false)}
        open={bulkDeleteOpen}
        questionnaireId={questionnaireId}
        submissionIds={selectedRows.map((row) => row.original.id)}
        workspaceId={workspaceId}
      />
    </>
  )
}
