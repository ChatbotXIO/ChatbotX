import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { WhatsappSettingTabs } from "@/features/integration-whatsapp/components/whatsapp-setting-tabs"

type LayoutProps = {
  children: ReactNode
  params: Promise<{ workspaceId: string; id: string }>
}

export default async function WhatsappLayout({
  children,
  params,
}: LayoutProps) {
  const t = await getTranslations()
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return (
    <>
      <AppBreadcrumb
        items={[
          {
            label: t("channels.title"),
            href: `/space/${workspaceId}/settings/channels`,
          },
          { label: t("fields.whatsapp.label"), href: "" },
        ]}
      />
      <WhatsappSettingTabs />

      <div>{children}</div>
    </>
  )
}
