"use client"

import { useParams } from "next/navigation"
import type { ReactNode } from "react"
import { AppTab } from "@/components/app-tab"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default function FolderableLayout({
  children,
  folders,
}: {
  children: ReactNode
  folders: ReactNode
}) {
  const { chatbotId } = useParams<{ chatbotId: string }>()

  return (
    <FolderStoreProvider chatbotId={chatbotId} folderType="flow">
      <AppTab chatbotId={chatbotId} />
      {folders}
      {children}
    </FolderStoreProvider>
  )
}
