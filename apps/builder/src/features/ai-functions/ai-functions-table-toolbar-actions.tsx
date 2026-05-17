"use client"

import { useRouter } from "next/navigation"
import { AIFunctionsCreate } from "./ai-functions-create"

type AIFunctionsTableToolbarActionsProps = {
  workspaceId: string
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
