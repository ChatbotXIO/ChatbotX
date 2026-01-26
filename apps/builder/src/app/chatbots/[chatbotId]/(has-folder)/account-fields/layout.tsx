import { FolderType } from "@aha.chat/database/types"
import { Separator } from "@aha.chat/ui/components/ui/separator"
import type { ReactNode } from "react"
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
  const { chatbotId } = await params

  return (
    <FolderStoreProvider
      chatbotId={chatbotId}
      folderType={FolderType.customField}
    >
      {folders}
      <Separator className="my-4" />
      {children}
    </FolderStoreProvider>
  )
}
