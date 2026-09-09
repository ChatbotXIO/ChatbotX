import { notFound } from "next/navigation"
import { getFbComment } from "@/features/fb-comments/queries"
import { CommentAutomationAnalyticsClient } from "@/features/shared/comment-automation/comment-automation-analytics-client"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function FbCommentAnalyticsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  let fbComment: Awaited<ReturnType<typeof getFbComment>>
  try {
    fbComment = await getFbComment(workspaceId, id)
  } catch {
    return notFound()
  }

  return (
    <div className="container mx-auto flex flex-col gap-6 py-6">
      <CommentAutomationAnalyticsClient
        automationId={id}
        automationName={fbComment.name}
        workspaceId={workspaceId}
      />
    </div>
  )
}
