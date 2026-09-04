"use client"

import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { SupportAccessCard } from "./components/support-access-card"
import { WorkspaceDeletionCard } from "./components/workspace-deletion-card"
import { UpdateWorkspaceAdvancedForm } from "./update-workspace-advanced-form"
import { UpdateWorkspaceBasicForm } from "./update-workspace-basic-form"

export function UpdateWorkspaceForm({
  workspace,
  canManageSupportAccess,
}: {
  workspace: WorkspaceResource
  canManageSupportAccess: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <UpdateWorkspaceBasicForm workspace={workspace} />
      <UpdateWorkspaceAdvancedForm workspace={workspace} />
      <SupportAccessCard
        canManage={canManageSupportAccess}
        workspace={{
          id: workspace.id,
          supportAccessUntil: workspace.supportAccessUntil,
        }}
      />
      <WorkspaceDeletionCard
        workspace={{
          id: workspace.id,
          scheduledDeletionAt: workspace.scheduledDeletionAt,
        }}
      />
    </div>
  )
}
