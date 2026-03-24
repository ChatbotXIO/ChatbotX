import { FolderType } from "@aha.chat/database/enums"
import { type ReactNode, Suspense } from "react"
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
  const { chatbotId } = await params

  return (
    <FolderStoreProvider
      autoInitialize={true}
      chatbotId={chatbotId}
      folderType={FolderType.sequence}
    >
      {folders}
      <Suspense>
        <FlowStoreProvider autoInitialize={true} chatbotId={chatbotId}>
          {children}
        </FlowStoreProvider>
      </Suspense>
    </FolderStoreProvider>
  )
}
