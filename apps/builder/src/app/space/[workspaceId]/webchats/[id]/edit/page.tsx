import { notFound } from "next/navigation"
import { Suspense } from "react"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { UpdateWebchatForm } from "@/features/integration-webchat/components/update-webchat-form"
import { findIntegrationWebchat } from "@/features/integration-webchat/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function WebchatEditPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const integrationWebchat = await findIntegrationWebchat({
    id: data.id,
    workspaceId: data.workspaceId,
  })

  return (
    <FlowStoreProvider workspaceId={data.workspaceId}>
      <Suspense fallback={<div>Loading...</div>}>
        <UpdateWebchatForm integrationWebchat={integrationWebchat} />
      </Suspense>
    </FlowStoreProvider>
  )
}
