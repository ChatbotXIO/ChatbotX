"use client"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"
import { useWorkspaceId } from "@/hooks/routing"

/**
 * Layout da página /flows — só FolderStoreProvider + children.
 * Pedro pediu pra remover o painel "Pastas" do topo em TODAS as páginas
 * (2026-05-24) pra deixar UI flat estilo Respond.io.
 */
export default function FolderableLayout({
  children,
}: {
  children: ReactNode
  folders: ReactNode
}) {
  const workspaceId = useWorkspaceId()
  if (!workspaceId) {
    return notFound()
  }

  return (
    <FolderStoreProvider folderType="flow" workspaceId={workspaceId}>
      {children}
    </FolderStoreProvider>
  )
}
