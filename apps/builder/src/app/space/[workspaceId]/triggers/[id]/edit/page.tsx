import { notFound } from "next/navigation"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { findTrigger } from "@/features/triggers/queries"
import UpdateTriggerForm from "@/features/triggers/update-trigger-form"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function UpdateTriggerPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const trigger = await findTrigger({ workspaceId, id })
  if (!trigger) {
    return notFound()
  }

  return (
    <FlowStoreProvider autoInitialize={true} workspaceId={workspaceId}>
      <CustomFieldStoreProvider autoInitialize={true} workspaceId={workspaceId}>
        <TagStoreProvider autoInitialize={true} workspaceId={workspaceId}>
          <UpdateTriggerForm trigger={trigger} workspaceId={workspaceId} />
        </TagStoreProvider>
      </CustomFieldStoreProvider>
    </FlowStoreProvider>
  )
}
