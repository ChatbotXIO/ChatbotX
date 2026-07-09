import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { WhatsappSettingTabs } from "@/features/integration-whatsapp/components/whatsapp-setting-tabs"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

type LayoutProps = {
  children: ReactNode
  params: Promise<{ workspaceId: string; id: string }>
}

export default async function WhatsappLayout({
  children,
  params,
}: LayoutProps) {
  const t = await getTranslations()
  const workspaceId = await resolveGuardedWorkspaceId(params, "superAdmin")

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
