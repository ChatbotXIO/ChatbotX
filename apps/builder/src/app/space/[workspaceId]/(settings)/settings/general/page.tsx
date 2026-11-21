import { listConnectedCallSummaryProviders } from "@chatbotx.io/ai/server"
import { isSupportConsentRequired } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"

import { listIntegrationOpenaiCompatible } from "@/features/integration-openai-compatible/queries"
import { canManageTranslation } from "@/features/translation/lib/assert-can-manage"
import { UpdateWorkspaceForm } from "@/features/workspaces/update-workspace-form"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function GeneralPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const [userAndWorkspace, consentRequired] = await Promise.all([
    getCurrentUserAndTargetWorkspace(workspaceId),
    isSupportConsentRequired(),
  ])
  if (!userAndWorkspace) {
    return notFound()
  }

  // Only an admin can change translation; everyone else sees it read-only and
  // needs neither list, so those queries are skipped for them.
  const canManageTranslationSettings = canManageTranslation(
    userAndWorkspace.targetWorkspaceMember,
  )
  const [connectedAiProviders, openaiCompatibleIntegrations] =
    canManageTranslationSettings
      ? await Promise.all([
          listConnectedCallSummaryProviders(workspaceId),
          listIntegrationOpenaiCompatible({ workspaceId }),
        ])
      : [[], []]

  return (
    <UpdateWorkspaceForm
      canManageSupportAccess={
        hasWorkspacePermission(
          userAndWorkspace.targetWorkspaceMember.permissions,
          "superAdmin",
        ) && !userAndWorkspace.isSupportSession
      }
      canManageTranslation={canManageTranslationSettings}
      connectedAiProviders={connectedAiProviders}
      consentRequired={consentRequired}
      openaiCompatibleIntegrations={openaiCompatibleIntegrations}
      workspace={userAndWorkspace.targetWorkspace}
    />
  )
}
