import { broadcastService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isRecurringTemplate } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { BroadcastRunsView } from "@/features/broadcasts/components/broadcast-runs-view"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function BroadcastRunsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; broadcastId: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const broadcastId = getIdFromParams(resolvedParams, "broadcastId")
  if (!(workspaceId && broadcastId)) {
    return notFound()
  }

  await assertCurrentUserCanAccessChatbot(workspaceId)

  // Only a repeating broadcast has runs; anything else (or another
  // workspace's row) does not resolve here.
  const broadcast = await broadcastService
    .findByIdOrName({ workspaceId, idOrName: broadcastId })
    .catch((error: unknown) => {
      if (error instanceof ChatbotXException && error.code === "notFound") {
        return null
      }
      throw error
    })
  if (!(broadcast && isRecurringTemplate(broadcast) && broadcast.recurrence)) {
    return notFound()
  }

  return <BroadcastRunsView broadcast={broadcast} workspaceId={workspaceId} />
}
