import { FolderType } from "@aha.chat/database/enums"
import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default async function WebhooksLayout({
  children,
  folders,
  params,
}: {
  children: ReactNode
  folders: ReactNode
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  return (
    <FolderStoreProvider
      autoInitialize={true}
      chatbotId={chatbotId}
      folderType={FolderType.webhook}
    >
      {folders}
      {children}
    </FolderStoreProvider>
  )
}
