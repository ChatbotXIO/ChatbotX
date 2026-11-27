import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { PostsCalendar } from "@/features/social-posts/components/calendar/posts-calendar"
import { resolvePostsPageContext } from "@/features/social-posts/lib/posts-page-context"
import { getUserTimezone } from "@/lib/timezone"

export default async function PostsCalendarPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const { readOnly } = await resolvePostsPageContext(workspaceId)

  return (
    <PostsCalendar
      readOnly={readOnly}
      timezone={await getUserTimezone()}
      workspaceId={workspaceId}
    />
  )
}
