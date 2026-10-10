import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { MiniAppEditor } from "@/features/mini-apps/editor/mini-app-editor"
import { buildMiniAppPublicUrl } from "@/features/mini-apps/lib/public-url"
import {
  findMiniApp,
  listWhatsappPublishTargets,
} from "@/features/mini-apps/queries"

export default async function EditMiniAppPage({
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
  const [miniApp, publishTargets] = await Promise.all([
    findMiniApp({ workspaceId, id }),
    listWhatsappPublishTargets(workspaceId),
  ])
  if (!miniApp) {
    return notFound()
  }

  return (
    <MiniAppEditor
      initialDefinition={miniApp.definition}
      initialName={miniApp.name}
      // Remount after a save so the editor starts from the stored version.
      key={miniApp.updatedAt.toISOString()}
      miniAppId={miniApp.id}
      publicUrl={buildMiniAppPublicUrl(miniApp.id)}
      publishTargets={publishTargets}
      workspaceId={workspaceId}
    />
  )
}
