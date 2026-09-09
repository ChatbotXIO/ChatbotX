import { notFound } from "next/navigation"
import { getIgComment } from "@/features/ig-comments/queries"
import { CommentAutomationAnalyticsClient } from "@/features/shared/comment-automation/comment-automation-analytics-client"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function IgCommentAnalyticsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  let igComment: Awaited<ReturnType<typeof getIgComment>>
  try {
    igComment = await getIgComment(workspaceId, id)
  } catch {
    return notFound()
  }

  return (
    <div className="container mx-auto flex flex-col gap-6 py-6">
      <CommentAutomationAnalyticsClient
        automationId={id}
        automationName={igComment.name}
        workspaceId={workspaceId}
      />
    </div>
  )
}
