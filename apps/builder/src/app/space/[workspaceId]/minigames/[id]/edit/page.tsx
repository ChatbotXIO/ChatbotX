import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { buildMinigamePlayUrl } from "@/features/minigames/lib/play-url"
import { MinigameForm } from "@/features/minigames/minigame-form"
import { findMinigame } from "@/features/minigames/queries"
import { LockedContent } from "@/features/templates/components/locked-editor"
import { LockedEditorGuard } from "@/features/templates/components/locked-editor-guard"

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

  const publicUrl = buildMinigamePlayUrl(minigame.id)

  return (
    <LockedEditorGuard
      resourceId={id}
      resourceKind="minigame"
      workspaceId={workspaceId}
    >
      <LockedContent>
        <MinigameForm
          minigame={minigame}
          mode="edit"
          publicUrl={publicUrl}
          workspaceId={workspaceId}
        />
      </LockedContent>
    </LockedEditorGuard>
  )
}
