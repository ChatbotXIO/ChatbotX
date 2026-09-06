import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { MinigameForm } from "@/features/minigames/minigame-form"
import { findMinigame } from "@/features/minigames/queries"
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

  const publicUrl = `${getBrokerOrigin()}/minigames?minigameId=${minigame.id}&token={{minigame_play_token}}`

  return (
    <FlowStoreProvider workspaceId={workspaceId}>
      <CustomFieldStoreProvider workspaceId={workspaceId}>
        <MinigameForm
          minigame={minigame}
          mode="edit"
          publicUrl={publicUrl}
          workspaceId={workspaceId}
        />
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
