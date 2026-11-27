import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import { InboxListLandingPage } from "@/features/inboxes/components/landing-inbox-list"
import { loadPollLinks } from "@/features/polls/lib/poll-links"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export default async function PollLandingPage({
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

  const { servable } = await loadServableWorkspace(workspaceId)
  if (!servable) {
    return notFound()
  }

  const loaded = await loadPollLinks({ workspaceId, pollId: id }).catch(
    (error: unknown) => {
      if (error instanceof ChatbotXException && error.httpStatusCode === 404) {
        return null
      }
      throw error
    },
  )
  if (!loaded) {
    return notFound()
  }

  const inboxLinks = loaded.links.links.flatMap((link) => {
    const inbox = loaded.inboxes.find(
      (candidate) => candidate.id === link.inboxId,
    )
    return inbox ? [{ inbox, url: link.url }] : []
  })

  if (inboxLinks.length === 0) {
    return notFound()
  }

  if (inboxLinks.length === 1) {
    redirect(inboxLinks[0].url)
  }

  return <InboxListLandingPage inboxLinks={inboxLinks} />
}
