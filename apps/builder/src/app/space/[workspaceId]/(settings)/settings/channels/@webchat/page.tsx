import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listIntegrationWebchats } from "@/features/integration-webchat/queries"
import { listIntegrationWebchatsRequest } from "@/features/integration-webchat/schema/query"
import { WebchatTable } from "@/features/integration-webchat/webchat-table"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function SettingChannelWebchatPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listIntegrationWebchatsRequest.parse(searchParams)

  const promises = Promise.all([
    listIntegrationWebchats({
      ...search,
      workspaceId: data.workspaceId,
    }),
  ])

  return (
    <Suspense>
      <WebchatTable promises={promises} />
    </Suspense>
  )
}
