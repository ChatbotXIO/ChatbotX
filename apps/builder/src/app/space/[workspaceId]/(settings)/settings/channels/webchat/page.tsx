import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listIntegrationWebchats } from "@/features/integration-webchat/queries"
import { listIntegrationWebchatsRequest } from "@/features/integration-webchat/schema/query"
import { WebchatTable } from "@/features/integration-webchat/webchat-table"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelWebchatPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  await requireVisibleChannel(data.workspaceId, "webchat")

  const searchParams = await props.searchParams
  const search = listIntegrationWebchatsRequest.parse(searchParams)

  const promises = Promise.all([
    listIntegrationWebchats({
      ...search,
      workspaceId: data.workspaceId,
    }),
  ])
  const canCreate = await resolveChannelCreatable(data.workspaceId, "webchat")

  return (
    <Suspense>
      <WebchatTable canCreate={canCreate} promises={promises} />
    </Suspense>
  )
}
