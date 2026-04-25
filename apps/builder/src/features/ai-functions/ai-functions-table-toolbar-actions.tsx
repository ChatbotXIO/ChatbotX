"use client"

import type { AIFunctionModel } from "@chatbotx.io/database/types"
import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { AIFunctionsCreate } from "./ai-functions-create"

type AIFunctionsTableToolbarActionsProps = {
  workspaceId: string
  table: Table<AIFunctionModel>
}

export function AIFunctionsTableToolbarActions({
  workspaceId,
}: AIFunctionsTableToolbarActionsProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      <AIFunctionsCreate
        onSuccess={() => {
          router.refresh()
        }}
        workspaceId={workspaceId}
      />
    </div>
  )
}
