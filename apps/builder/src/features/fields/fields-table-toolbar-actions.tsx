"use client"

import { Field } from "@ahachat.ai/database"
import { type Table } from "@tanstack/react-table"

interface FieldsTableToolbarActionsProps {
  table: Table<Field>
  chatbotId: string
}

export function FieldsTableToolbarActions({
  table,
  chatbotId,
}: FieldsTableToolbarActionsProps) {
  return (
    <div className="flex items-center gap-2">
    </div>
  )
}
