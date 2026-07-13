"use client"

import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { WorkspaceDeletionCard } from "./components/workspace-deletion-card"
import { UpdateWorkspaceAdvancedForm } from "./update-workspace-advanced-form"
import { UpdateWorkspaceBasicForm } from "./update-workspace-basic-form"

export function UpdateWorkspaceForm({
  workspace,
}: {
  workspace: WorkspaceResource
}) {
  return (
    <div className="flex flex-col gap-4">
      <UpdateWorkspaceBasicForm workspace={workspace} />
      <UpdateWorkspaceAdvancedForm workspace={workspace} />
      <WorkspaceDeletionCard
        workspace={{
          id: workspace.id,
          scheduledDeletionAt: workspace.scheduledDeletionAt,
        }}
      />
    </div>
  )
}
