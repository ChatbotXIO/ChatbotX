import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { WhatsappSettingTabs } from "@/features/integration-whatsapp/components/whatsapp-setting-tabs"

type LayoutProps = {
  children: ReactNode
  params: Promise<{ chatbotId: string; id: string }>
}

export default async function WhatsappLayout({
  children,
  params,
}: LayoutProps) {
  const t = await getTranslations()
  const { chatbotId } = await params

  return (
    <>
      <AppBreadcrumb
        items={[
          {
            label: t("channels.title"),
            href: `/chatbots/${chatbotId}/settings/channels`,
          },
          { label: t("fields.whatsapp.label"), href: "" },
        ]}
      />
      <WhatsappSettingTabs />

      <div>{children}</div>
    </>
  )
}
