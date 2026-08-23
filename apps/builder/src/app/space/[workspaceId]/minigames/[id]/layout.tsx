import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { ReactNode } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { findMinigame } from "@/features/minigames/queries"
import { MinigameTab } from "./tab"

export default async function MinigameLayout({
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

  const [t, minigame] = await Promise.all([
    getTranslations(),
    findMinigame({ workspaceId, id }),
  ])
  if (!minigame) {
    return notFound()
  }

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("minigames.title"),
            href: `/space/${workspaceId}/minigames`,
          },
          { label: minigame.name, href: "" },
        ]}
      />
      <MinigameTab minigameId={id} />
      {children}
    </div>
  )
}
