import { minigameTypes } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { MinigameForm } from "@/features/minigames/minigame-form"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"

export default async function CreateMinigamePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    redirect("/")
  }

  const resolvedSearchParams = await searchParams
  const parsedType = minigameTypes.safeParse(resolvedSearchParams.type)
  if (!parsedType.success) {
    redirect(`/space/${workspaceId}/minigames`)
  }

  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          {
            label: t("tools.title"),
            href: `/space/${workspaceId}/tools`,
          },
          {
            label: t("minigames.title"),
            href: `/space/${workspaceId}/minigames`,
          },
          { label: t("actions.create"), href: "" },
        ]}
      />
      <FlowStoreProvider workspaceId={workspaceId}>
        <TagStoreProvider workspaceId={workspaceId}>
          <MinigameForm
            mode="create"
            type={parsedType.data}
            workspaceId={workspaceId}
          />
        </TagStoreProvider>
      </FlowStoreProvider>
    </div>
  )
}
