import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { listThreadsComments } from "@/features/threads-comments/queries"
import { listThreadsCommentsSearchParamsCache } from "@/features/threads-comments/schema/action"
import { ThreadsCommentsTable } from "@/features/threads-comments/threads-comments-table"

export default async function ThreadsCommentsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const search = await listThreadsCommentsSearchParamsCache.parse(
    await props.searchParams,
  )
  const promises = Promise.all([
    listThreadsComments({ ...search, workspaceId }),
  ])

  return <ThreadsCommentsTable promises={promises} workspaceId={workspaceId} />
}
