import { folderTypes } from "@chatbotx.io/database/partials"
import type { ReactNode } from "react"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function TriggersLayout({
  children,
  folders,
  params,
}: {
  children: ReactNode
  folders: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "superAdmin")

  return (
    <FolderStoreProvider
      autoInitialize={true}
      folderType={folderTypes.enum.trigger}
      workspaceId={workspaceId}
    >
      {folders}
      {children}
    </FolderStoreProvider>
  )
}
