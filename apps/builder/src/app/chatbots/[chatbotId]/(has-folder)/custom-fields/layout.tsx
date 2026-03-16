import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { AppTab } from "@/components/app-tab"
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
  const t = await getTranslations()

  return (
    <FolderStoreProvider chatbotId={chatbotId} folderType="customField">
      <AppBreadcrumb
        items={[
          {
            label: t("fields.flows.label"),
            href: `/chatbots/${chatbotId}/flows`,
          },
          { label: t("customField.heading.title"), href: "" },
        ]}
      />
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
            isActive: true,
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
