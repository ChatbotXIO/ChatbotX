import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default async function FolderableLayout({
  children,
  folders,
  params,
}: {
  children: ReactNode
  folders: ReactNode
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  return (
    <FolderStoreProvider chatbotId={chatbotId} folderType="automatedResponse">
      <FlowStoreProvider chatbotId={chatbotId}>
        {folders}
        {children}
      </FlowStoreProvider>
    </FolderStoreProvider>
  )
}
