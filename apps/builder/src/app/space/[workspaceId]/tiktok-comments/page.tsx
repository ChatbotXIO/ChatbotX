import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { listTiktokComments } from "@/features/tiktok-comments/queries"
import { listTiktokCommentsSearchParamsCache } from "@/features/tiktok-comments/schema/action"
import { TiktokCommentsTable } from "@/features/tiktok-comments/tiktok-comments-table"

export default async function TiktokCommentsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const search = await listTiktokCommentsSearchParamsCache.parse(
    await props.searchParams,
  )
  const promises = Promise.all([listTiktokComments({ ...search, workspaceId })])

  return <TiktokCommentsTable promises={promises} workspaceId={workspaceId} />
}
