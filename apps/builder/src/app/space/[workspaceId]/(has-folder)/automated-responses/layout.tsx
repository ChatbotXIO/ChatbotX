import type { ReactNode } from "react"
import { KeywordsDescription } from "@/features/automated-response/keywords-description"
import { KeywordsTab } from "@/features/automated-response/keywords-tab"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function FolderableLayout({
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
      folderType="automatedResponse"
      workspaceId={workspaceId}
    >
      <FlowStoreProvider workspaceId={workspaceId}>
        <KeywordsTab />
        <KeywordsDescription type="inbound" />
        {folders}
        {children}
      </FlowStoreProvider>
    </FolderStoreProvider>
  )
}
