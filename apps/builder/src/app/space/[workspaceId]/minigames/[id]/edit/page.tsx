import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { MinigameForm } from "@/features/minigames/minigame-form"
import { findMinigame } from "@/features/minigames/queries"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { getBrokerOrigin } from "@/lib/oauth-broker"

export default async function EditMinigamePage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")

  if (!(workspaceId && id)) {
    return notFound()
  }

  const minigame = await findMinigame({ workspaceId, id })
  if (!minigame) {
    return notFound()
  }

  const t = await getTranslations()

  const publicUrl = `${getBrokerOrigin()}/minigames?minigameId=${minigame.id}&userId={{user_id}}`

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
          { label: t("actions.edit"), href: "" },
        ]}
      />
      <FlowStoreProvider workspaceId={workspaceId}>
        <TagStoreProvider workspaceId={workspaceId}>
          <MinigameForm
            minigame={minigame}
            mode="edit"
            publicUrl={publicUrl}
            workspaceId={workspaceId}
          />
        </TagStoreProvider>
      </FlowStoreProvider>
    </div>
  )
}
