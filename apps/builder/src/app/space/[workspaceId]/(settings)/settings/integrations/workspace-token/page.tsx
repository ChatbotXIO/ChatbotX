import { workspaceApiTokenService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ManageWorkspaceTokens } from "@/features/workspaces/manage-workspace-tokens"
import { toWorkspaceApiTokenDto } from "@/features/workspaces/schema/workspace-token-dto"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function SettingsWorksaceTokenPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }

  const tokens = await workspaceApiTokenService.listTokens({ workspaceId })

  return (
    <ManageWorkspaceTokens
      tokens={tokens.map(toWorkspaceApiTokenDto)}
      workspaceId={workspaceId}
    />
  )
}
