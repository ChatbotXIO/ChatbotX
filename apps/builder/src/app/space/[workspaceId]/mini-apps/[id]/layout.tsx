import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { findMiniApp } from "@/features/mini-apps/queries"
import { MiniAppTab } from "./tab"

export default async function MiniAppLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }
  const [t, miniApp] = await Promise.all([
    getTranslations(),
    findMiniApp({ workspaceId, id }),
  ])
  if (!miniApp) {
    return notFound()
  }

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("miniApps.title"),
            href: `/space/${workspaceId}/mini-apps`,
          },
          { label: miniApp.name, href: "" },
        ]}
      />
      <MiniAppTab miniAppId={id} />
      {children}
    </div>
  )
}
