import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default async function TagsSettingsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return (
    <FolderStoreProvider folderType="tag" workspaceId={workspaceId}>
      {children}
    </FolderStoreProvider>
  )
}
