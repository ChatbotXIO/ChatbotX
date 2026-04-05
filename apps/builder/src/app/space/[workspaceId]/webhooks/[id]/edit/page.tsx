import { notFound } from "next/navigation"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { findWebhook } from "@/features/webhooks/queries"
import UpdateWebhookForm from "@/features/webhooks/update-webhook-form"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function UpdateWebhookPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const webhook = await findWebhook({ workspaceId, id })
  if (!webhook) {
    return notFound()
  }

  return (
    <FlowStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <CustomFieldStoreProvider autoInitialize={true} workspaceId={workspaceId}>
        <TagStoreProvider autoInitialize={true} workspaceId={workspaceId}>
          <UpdateWebhookForm webhook={webhook} workspaceId={workspaceId} />
        </TagStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
