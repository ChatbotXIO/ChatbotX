import { folderTypes } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { type ReactNode, Suspense } from "react"

import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default async function FolderableLayout({
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
    <FolderStoreProvider
      autoInitialize={true}
      folderType={folderTypes.enum.igStory}
      workspaceId={workspaceId}
    >
      <Suspense>{children}</Suspense>
    </FolderStoreProvider>
  )
}
