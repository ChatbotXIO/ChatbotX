import { folderTypes } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { type ReactNode, Suspense } from "react"
import { AIAgentStoreProvider } from "@/features/ai-agents/provider/ai-agent-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default async function FolderableLayout({
  children,
  folders,
  params,
}: {
  children: ReactNode
  folders: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return (
    <FolderStoreProvider
      autoInitialize={true}
      folderType={folderTypes.enum.fbComment}
      workspaceId={workspaceId}
    >
      <FlowStoreProvider autoInitialize={true} workspaceId={workspaceId}>
        <AIAgentStoreProvider autoInitialize={true} workspaceId={workspaceId}>
          {folders}
          <Suspense>{children}</Suspense>
        </AIAgentStoreProvider>
      </FlowStoreProvider>
    </FolderStoreProvider>
  )
}
