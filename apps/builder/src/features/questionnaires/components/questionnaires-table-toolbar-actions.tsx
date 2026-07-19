"use client"

import type { Table } from "@tanstack/react-table"
import type { QuestionnaireListItem } from "../schemas/resource"
import { CreateQuestionnaireDialog } from "./create-questionnaire-dialog"

export function QuestionnairesTableToolbarActions({
  workspaceId,
}: {
  workspaceId: string
  table: Table<QuestionnaireListItem>
}) {
  return <CreateQuestionnaireDialog workspaceId={workspaceId} />
}
