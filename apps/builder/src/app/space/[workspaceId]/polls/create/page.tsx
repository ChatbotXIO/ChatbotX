import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { PollForm } from "@/features/polls/components/poll-form"

export default async function CreatePollPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  return <PollForm workspaceId={workspaceId} />
}
