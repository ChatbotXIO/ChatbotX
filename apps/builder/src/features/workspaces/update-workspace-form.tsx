"use client"

import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schema/resource"
import {
  type ConnectedAiProvider,
  InboxTranslationCard,
} from "@/features/translation/components/inbox-translation-card"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { SupportAccessCard } from "./components/support-access-card"
import { WorkspaceDeletionCard } from "./components/workspace-deletion-card"
import { UpdateWorkspaceAdvancedForm } from "./update-workspace-advanced-form"
import { UpdateWorkspaceBasicForm } from "./update-workspace-basic-form"

export function UpdateWorkspaceForm({
  workspace,
  canManageSupportAccess,
  consentRequired,
  canManageTranslation,
  connectedAiProviders,
  openaiCompatibleIntegrations,
}: {
  workspace: WorkspaceResource
  canManageSupportAccess: boolean
  consentRequired: boolean
  canManageTranslation: boolean
  connectedAiProviders: ConnectedAiProvider[]
  openaiCompatibleIntegrations: IntegrationOpenaiCompatibleResource[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <UpdateWorkspaceBasicForm workspace={workspace} />
      <UpdateWorkspaceAdvancedForm workspace={workspace} />
      {/* Hidden while the workspace waits for deletion: nothing may be changed. */}
      {!workspace.scheduledDeletionAt && (
        <InboxTranslationCard
          canManage={canManageTranslation}
          connectedProviders={connectedAiProviders}
          openaiCompatibleIntegrations={openaiCompatibleIntegrations}
          workspaceId={workspace.id}
        />
      )}
      <SupportAccessCard
        canManage={canManageSupportAccess}
        consentRequired={consentRequired}
        workspace={{
          id: workspace.id,
          supportAccessUntil: workspace.supportAccessUntil,
        }}
      />
      <WorkspaceDeletionCard
        workspace={{
          id: workspace.id,
          purgeStartedAt: workspace.purgeStartedAt,
          scheduledDeletionAt: workspace.scheduledDeletionAt,
        }}
      />
    </div>
  )
}
