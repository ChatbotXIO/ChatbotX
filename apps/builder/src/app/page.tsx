import { userQuotaService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import WorkspacesList from "@/features/workspaces/components/workspaces-list"
import { getCurrentUserAndAllLinkedWorkspaces } from "@/lib/auth/utils"

export default async function MainPage() {
  const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
  if (!userAndWorkspaces) {
    return notFound()
  }

  const quota = await userQuotaService.getForUser(userAndWorkspaces.user.id)

  return (
    <WorkspacesList
      workspaces={userAndWorkspaces.allWorkspaces}
      workspacesLimit={quota?.workspacesLimit ?? null}
    />
  )
}
