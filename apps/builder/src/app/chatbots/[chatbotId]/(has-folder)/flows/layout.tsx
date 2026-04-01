"use client"
import { notFound } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { AppTab } from "@/components/app-tab"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"
import { useChatbotId } from "@/hooks/routing"

export default function FolderableLayout({
  children,
  folders,
}: {
  children: ReactNode
  folders: ReactNode
}) {
  const t = useTranslations()

  const chatbotId = useChatbotId()
  if (!chatbotId) {
    return notFound()
  }

  return (
    <FolderStoreProvider chatbotId={chatbotId} folderType="flow">
      <AppTab
        tabs={[
          {
            label: t("flows.title"),
            href: `/chatbots/${chatbotId}/flows`,
            isActive: true,
          },
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
