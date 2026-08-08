import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { KeywordsDescription } from "@/features/automated-response/keywords-description"
import { KeywordsTab } from "@/features/automated-response/keywords-tab"
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
      folderType="outboundAutomatedResponse"
      workspaceId={workspaceId}
    >
      <FlowStoreProvider workspaceId={workspaceId}>
        <KeywordsTab />
        <KeywordsDescription type="outbound" />
        {folders}
        {children}
      </FlowStoreProvider>
    </FolderStoreProvider>
  )
}
