"use client"

import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { UpdateChatbotAdvancedForm } from "./update-workspace-advanced-form"
import { UpdateChatbotBasicForm } from "./update-workspace-basic-form"

export function UpdateWorkspaceForm({
  workspace,
}: {
  workspace: WorkspaceResource
}) {
  return (
    <div className="flex flex-col gap-4">
      <UpdateChatbotBasicForm workspace={workspace} />
      <UpdateChatbotAdvancedForm workspace={workspace} />
    </div>
  )
}
