"use client"

import type { Table } from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { AIMcpServersCreate } from "./ai-mcp-servers-create"
import type { AIMcpServerResource } from "./schema/resource"

type AIMcpServersTableToolbarActionsProps = {
  workspaceId: string
  table: Table<AIMcpServerResource>
}

export const AIMcpServersTableToolbarActions = ({
  workspaceId,
}: AIMcpServersTableToolbarActionsProps) => {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      <AIMcpServersCreate
        onSuccess={() => {
          router.refresh()
        }}
        workspaceId={workspaceId}
      />
    </div>
  )
}
