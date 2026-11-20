import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { PollForm } from "@/features/polls/components/poll-form"
import { findPoll } from "@/features/polls/queries"
import { LockedEditorGuard } from "@/features/templates/components/locked-editor-guard"

export default async function EditPollPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolved = await params
  const workspaceId = getIdFromParams(resolved, "workspaceId")
  const id = getIdFromParams(resolved, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }

  const poll = await findPoll({ workspaceId, id })
  if (!poll) {
    return notFound()
  }

  return (
    <LockedEditorGuard
      resourceId={id}
      resourceKind="poll"
      workspaceId={workspaceId}
    >
      <PollForm poll={poll} workspaceId={workspaceId} />
    </LockedEditorGuard>
  )
}
