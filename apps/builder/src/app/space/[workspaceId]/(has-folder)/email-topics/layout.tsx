import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { AppTab } from "@/components/app-tab"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default async function EmailTopicsLayout({
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

  const t = await getTranslations()

  return (
    <FolderStoreProvider folderType="emailTopic" workspaceId={workspaceId}>
      <AppTab
        tabs={[
          {
            label: t("flows.title"),
            href: `/space/${workspaceId}/flows`,
            isActive: false,
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
            label: t("emailTopics.title"),
            href: `/space/${workspaceId}/email-topics`,
            isActive: true,
          },
          {
            label: t("errorLogs.title"),
            href: `/space/${workspaceId}/error-logs`,
            isActive: false,
          },
        ]}
      />
      {children}
    </FolderStoreProvider>
  )
}
