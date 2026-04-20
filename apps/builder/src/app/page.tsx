import { notFound } from "next/navigation"
import WorkspacesList from "@/features/workspaces/components/workspaces-list"
import { getCurrentUserAndAllLinkedWorkspaces } from "@/lib/auth/utils"

export default async function MainPage() {
  const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
  if (!userAndWorkspaces) {
    return notFound()
  }

  return <WorkspacesList workspaces={userAndWorkspaces.allWorkspaces} />
}
