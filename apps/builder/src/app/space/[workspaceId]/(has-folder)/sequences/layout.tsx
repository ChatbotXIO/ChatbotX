import { folderTypes } from "@chatbotx.io/database/partials"
import { type ReactNode, Suspense } from "react"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

// This layout and the non-grouped sequences layout both exist because route groups split URL-equivalent routes.

export default async function FolderableLayout({
  children,
  folders,
  params,
}: {
  children: ReactNode
  folders: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "broadcast")

  return (
    <FolderStoreProvider
      autoInitialize={true}
      folderType={folderTypes.enum.sequence}
      workspaceId={workspaceId}
    >
      {folders}
      <Suspense>
        <FlowStoreProvider autoInitialize={true} workspaceId={workspaceId}>
          {children}
        </FlowStoreProvider>
      </Suspense>
    </FolderStoreProvider>
  )
}
