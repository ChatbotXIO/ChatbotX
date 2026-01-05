import { FolderType } from "@aha.chat/database/types"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import type { ReactNode } from "react"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default async function TriggersLayout({
  children,
  folders,
  params,
}: {
  children: ReactNode
  folders: ReactNode
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  return (
    <FolderStoreProvider
      autoInitialize={true}
      chatbotId={chatbotId}
      folderType={FolderType.trigger}
    >
      {folders}
      <Separator />
      {children}
    </FolderStoreProvider>
  )
}
