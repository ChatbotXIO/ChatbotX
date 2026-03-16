"use client"

import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
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
  const t = useTranslations()

  return (
    <FolderStoreProvider chatbotId={chatbotId} folderType="flow">
      <AppTab
        tabs={[
          {
            label: t("tags.title"),
            href: `/chatbots/${chatbotId}/tags`,
            isActive: false,
          },
          {
            label: t("customFields.title"),
            href: `/chatbots/${chatbotId}/custom-fields`,
            isActive: false,
          },
          {
            label: t("errorLogs.title"),
            href: `/chatbots/${chatbotId}/error-logs`,
            isActive: false,
          },
        ]}
      />
      {folders}
      {children}
    </FolderStoreProvider>
  )
}
