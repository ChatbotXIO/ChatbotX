import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { AppTab } from "@/components/app-tab"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"

export default async function TagsLayout({
  children,
  folders,
  params,
}: {
  children: ReactNode
  folders: ReactNode
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const t = await getTranslations()

  return (
    <FolderStoreProvider chatbotId={chatbotId} folderType="tag">
      <AppBreadcrumb
        items={[
          {
            label: t("fields.flows.label"),
            href: `/chatbots/${chatbotId}/flows`,
          },
          { label: t("tags.title") },
        ]}
      />
      <AppTab
        tabs={[
          {
            label: t("tags.title"),
            href: `/chatbots/${chatbotId}/tags`,
            isActive: true,
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
