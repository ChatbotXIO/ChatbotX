"use client"
import { notFound } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { AppTab } from "@/components/app-tab"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"
import { useWorkspaceId } from "@/hooks/routing"

export default function FolderableLayout({
  children,
  folders,
}: {
  children: ReactNode
  folders: ReactNode
}) {
  const t = useTranslations()

  const workspaceId = useWorkspaceId()
  if (!workspaceId) {
    return notFound()
  }

  return (
    <FolderStoreProvider folderType="flow" workspaceId={workspaceId}>
      <AppTab
        tabs={[
          {
            label: t("flows.title"),
            href: `/space/${workspaceId}/flows`,
            isActive: true,
          },
          {
            label: t("tags.title"),
            href: `/space/${workspaceId}/tags`,
            isActive: false,
          },
          {
            label: t("customFields.title"),
            href: `/space/${workspaceId}/custom-fields`,
            isActive: false,
          },
          {
            label: t("errorLogs.title"),
            href: `/space/${workspaceId}/error-logs`,
            isActive: false,
          },
        ]}
      />
      {folders}
      {children}
    </FolderStoreProvider>
  )
}
